// 사용자 제보(정정 요청) 도메인 쿼리 — place_corrections(0049).
//
// 설계 원칙 두 가지가 이 파일 전체를 지배한다:
//
// 1) **승인 전에는 어디에도 새어나가지 않는다.** 읽기 경로(getActiveFuelReports,
//    getApprovedRepairBrand)는 전부 status='approved' 로 좁힌다. 정비소 브랜드는 지도 RPC
//    안에서 조인되므로 여기서는 상세 페이지용 단건 조회만 다룬다.
//
// 2) **마이그레이션 미적용에도 화면이 죽지 않는다.** 이 저장소는 SQL 을 운영자가 손으로
//    적용하므로 코드가 먼저 배포되는 순간이 반드시 존재한다. 테이블이 없으면 PostgREST 가
//    에러를 주는데, 그걸 그대로 던지면 주유소/정비소 상세가 통째로 500 이 된다.
//    → 읽기는 조용히 빈 값으로, 쓰기는 명시적인 'unavailable' 로 돌려준다.

import { getSupabase, isSupabaseConfigured } from './supabase';
import { getSignedUrls } from '@/lib/storage/photos';
import type {
  ActiveFuelReport,
  CorrectionKind,
  CorrectionPayload,
  CorrectionTargetType,
} from '@/types/correction';
import type { ProductCode } from '@/types/station';
import type { RepairBrand } from '@/types/repair';

type Row = any;

const PENDING_LIMIT = 200;

// ─────────────────────────── 쓰기 ───────────────────────────

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; code: 'duplicate' | 'unavailable' | 'failed'; message?: string };

/**
 * 제보 1건 생성(항상 status='pending').
 * 같은 사용자가 같은 대상에 이미 대기 중인 제보가 있으면 duplicate — 처리된 뒤에는 다시 낼 수 있다
 * (유니크 인덱스가 status='pending' 부분 인덱스라 그렇게 동작한다).
 */
export async function createCorrection(input: {
  kind: CorrectionKind;
  targetType: CorrectionTargetType;
  targetId: string;
  userId: string;
  payload: CorrectionPayload;
  photoPaths: string[];
}): Promise<CreateResult> {
  if (!isSupabaseConfigured()) return { ok: false, code: 'unavailable' };
  const sb = getSupabase();
  const { data, error } = await sb
    .from('place_corrections')
    .insert({
      kind: input.kind,
      target_type: input.targetType,
      target_id: input.targetId,
      user_id: input.userId,
      payload: input.payload,
      photo_paths: input.photoPaths,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation → 대기 중 중복 제보.
    if (error.code === '23505') return { ok: false, code: 'duplicate' };
    // 42P01(테이블 없음)/PGRST205(스키마 캐시에 없음) = 0049 미적용.
    if (error.code === '42P01' || error.code === 'PGRST205') return { ok: false, code: 'unavailable' };
    console.warn('correction insert fail:', error.message);
    return { ok: false, code: 'failed', message: error.message };
  }
  return { ok: true, id: (data as Row)?.id ?? '' };
}

// ─────────────────────────── 읽기(공개 화면) ───────────────────────────

/**
 * 주유소의 유효한 유가 제보 — 승인됐고 오피넷 기준일보다 최신인 것만.
 * 신선도 판정은 뷰(fuel_price_report_active)가 하므로 여기서는 걸러낼 게 없다.
 * 뷰가 없으면(0049 미적용) 빈 배열 — 가격 섹션은 공식 가격만으로 정상 렌더된다.
 */
export async function getActiveFuelReports(stationId: string): Promise<ActiveFuelReport[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('fuel_price_report_active')
    .select('product, reported_price, reported_at, official_price, official_trade_dt')
    .eq('station_id', stationId);
  if (error) return [];
  return (data as Row[] ?? []).map((r) => ({
    product: r.product as ProductCode,
    reportedPrice: r.reported_price,
    reportedAt: r.reported_at,
    officialPrice: r.official_price,
    officialTradeDt: r.official_trade_dt,
  }));
}

/**
 * 정비소 1곳의 승인된 브랜드 보정.
 * 반환값: 브랜드 코드 | 'none'(브랜드 없음으로 정정) | null(보정 없음).
 * 지도(bbox RPC)는 SQL 안에서 같은 뷰를 조인하므로 이 함수는 상세 페이지 전용이다.
 */
export async function getApprovedRepairBrand(shopKey: string): Promise<RepairBrand | 'none' | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('repair_brand_override')
    .select('brand')
    .eq('shop_key', shopKey)
    .maybeSingle();
  if (error || !data) return null;
  return ((data as Row).brand as RepairBrand | 'none' | null) ?? null;
}

// ─────────────────────────── 읽기(관리자) ───────────────────────────

export interface AdminCorrectionItem {
  id: string;
  kind: CorrectionKind;
  targetType: CorrectionTargetType;
  targetId: string;
  /** 대상 이름 — 관리자가 어디 얘긴지 알아야 판단할 수 있다. 못 찾으면 null. */
  targetName: string | null;
  /** 대상 주소 — 정비소는 이름이 흔해서 주소가 있어야 특정된다. */
  targetAddress: string | null;
  /** 현재 저장된 값(브랜드 코드 또는 유종별 공식 가격). 제보값과 나란히 보여준다. */
  currentValue: string | null;
  payload: CorrectionPayload;
  photoUrls: string[];
  reportedAt: string;
  reporter: { id: string; nickname: string | null; name: string | null; email: string | null };
}

export interface CorrectionQueue {
  pending: AdminCorrectionItem[];
  /** 0049 미적용이면 true — pending 은 항상 []. 화면이 안내 문구를 띄운다. */
  tableMissing: boolean;
}

function toPerson(u: Row) {
  const row = Array.isArray(u) ? u[0] : u;
  return {
    id: row?.id ?? '',
    nickname: row?.nickname ?? null,
    name: row?.name ?? null,
    email: row?.email ?? null,
  };
}

/** 대상 이름/주소/현재값을 한 번에 채운다(대상 종류별로 1쿼리씩, N+1 방지). */
async function enrichTargets(rows: Row[]): Promise<Map<string, { name: string | null; address: string | null; current: string | null }>> {
  const sb = getSupabase();
  const out = new Map<string, { name: string | null; address: string | null; current: string | null }>();

  const repairIds = rows.filter((r) => r.target_type === 'repair').map((r) => r.target_id);
  const gasIds = rows.filter((r) => r.target_type === 'gas').map((r) => r.target_id);

  if (repairIds.length) {
    const { data } = await sb
      .from('repair_shops')
      .select('shop_key, name, road_addr, jibun_addr, brand')
      .in('shop_key', Array.from(new Set(repairIds)));
    for (const r of (data as Row[]) ?? []) {
      out.set(`repair:${r.shop_key}`, {
        name: r.name ?? null,
        address: r.road_addr ?? r.jibun_addr ?? null,
        current: r.brand ?? null,
      });
    }
  }

  if (gasIds.length) {
    const uniqueGas = Array.from(new Set(gasIds));
    const { data: stations } = await sb
      .from('stations')
      .select('id, name, address')
      .in('id', uniqueGas);
    // 유가 제보의 '현재값'은 제보한 유종의 공식 가격이므로 유종까지 맞춰 찾아야 한다.
    const { data: prices } = await sb
      .from('prices_latest')
      .select('station_id, product, price, trade_dt')
      .in('station_id', uniqueGas);
    const priceMap = new Map<string, Row>();
    for (const p of (prices as Row[]) ?? []) priceMap.set(`${p.station_id}:${p.product}`, p);

    const stationMap = new Map<string, Row>();
    for (const s of (stations as Row[]) ?? []) stationMap.set(s.id, s);

    for (const r of rows) {
      if (r.target_type !== 'gas') continue;
      const s = stationMap.get(r.target_id);
      const product = r.payload?.product;
      const p = product ? priceMap.get(`${r.target_id}:${product}`) : null;
      out.set(`gas:${r.target_id}:${product ?? ''}`, {
        name: s?.name ?? null,
        address: s?.address ?? null,
        current: p ? `${p.price}원 (${p.trade_dt})` : null,
      });
    }
  }

  return out;
}

/** 미처리 제보 대기열(오래된 순 — 먼저 온 제보를 먼저 처리한다). */
export async function getCorrectionQueue(): Promise<CorrectionQueue> {
  if (!isSupabaseConfigured()) return { pending: [], tableMissing: false };
  const sb = getSupabase();

  const { data, error } = await sb
    .from('place_corrections')
    .select(
      `id, kind, target_type, target_id, payload, photo_paths, reported_at,
       reporter:users!inner(id, nickname, name, email)`,
    )
    .eq('status', 'pending')
    .order('reported_at', { ascending: true })
    .limit(PENDING_LIMIT);

  if (error) return { pending: [], tableMissing: true };

  const rows = (data as Row[]) ?? [];

  // 사진 서명 URL 은 한 번에 발급한다(관리자 리뷰 큐와 동일 패턴).
  const allPaths: string[] = [];
  for (const r of rows) allPaths.push(...((r.photo_paths as string[] | null) ?? []));
  const allUrls = await getSignedUrls(allPaths);

  const targets = await enrichTargets(rows);

  let cursor = 0;
  const pending: AdminCorrectionItem[] = rows.map((r) => {
    const paths: string[] = r.photo_paths ?? [];
    const photoUrls = allUrls.slice(cursor, cursor + paths.length);
    cursor += paths.length;
    const key =
      r.target_type === 'repair'
        ? `repair:${r.target_id}`
        : `gas:${r.target_id}:${r.payload?.product ?? ''}`;
    const info = targets.get(key);
    return {
      id: r.id,
      kind: r.kind,
      targetType: r.target_type,
      targetId: r.target_id,
      targetName: info?.name ?? null,
      targetAddress: info?.address ?? null,
      currentValue: info?.current ?? null,
      payload: r.payload,
      photoUrls,
      reportedAt: r.reported_at,
      reporter: toPerson(r.reporter),
    };
  });

  return { pending, tableMissing: false };
}

/**
 * 제보 처리(승인/반려).
 *
 * 승인이 곧 반영이다 — 별도의 적용 단계가 없다. 정비소 브랜드는 repair_brand_override 뷰가,
 * 유가는 fuel_price_report_active 뷰가 status='approved' 를 그대로 읽기 때문이다.
 * repair_shops.brand 를 직접 UPDATE 하지 않는 것이 핵심이다 — sync-repair 가 덮어쓴다.
 */
export async function resolveCorrection(
  id: string,
  approve: boolean,
  adminEmail: string,
  note?: string | null,
): Promise<{ ok: boolean; notFound?: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'not configured' };
  const sb = getSupabase();
  const { data, error } = await sb
    .from('place_corrections')
    .update({
      status: approve ? 'approved' : 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: adminEmail,
      admin_note: note ?? null,
    })
    .eq('id', id)
    .eq('status', 'pending')   // 이미 처리된 건을 두 번 뒤집지 않는다(동시 클릭 방어).
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, notFound: true };
  return { ok: true };
}
