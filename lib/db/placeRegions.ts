// SEO 지역 랜딩(/regions/{시도}/{시군구}/{layer})용 조회 — 정비소·세차장·EV 충전소.
//
// 세 테이블 모두 sigungu_code(0048, 주소에서 계산)를 갖고 있어 인덱스 한 번으로 지역을 뽑는다.
// 주유소 지역 페이지(lib/db/queries)와 같은 역할이되, 가격 개념이 없어 '최저가' 대신
// '이 지역에 무엇이 있는지'를 보여준다.
//
// 실패는 전부 빈 배열로 접는다 — 지역 페이지 하나가 DB 사정으로 500 을 내면 크롤러가
// 그 URL 을 통째로 버린다. 데이터가 없으면 없는 대로 렌더하고, 페이지 자체는 살린다.

import { getSupabase, isSupabaseConfigured } from './supabase';

/** 지역 랜딩이 다루는 장소 종류. URL 마지막 세그먼트와 1:1. */
export const PLACE_LAYERS = ['repair', 'carwash', 'ev'] as const;
export type PlaceLayer = (typeof PLACE_LAYERS)[number];

export function isPlaceLayer(v: string | undefined): v is PlaceLayer {
  return !!v && (PLACE_LAYERS as readonly string[]).includes(v);
}

/** 지역 랜딩 목록 1행 — 세 종류를 같은 모양으로 눕힌다(페이지가 하나라서). */
export interface RegionPlaceItem {
  /** 상세 페이지 링크용 키. ev 는 stat_id, 나머지는 각 테이블 PK. */
  key: string;
  name: string;
  address: string | null;
  /** 부가 표기 — 정비소=브랜드/유형, 세차장=세차유형, EV=사업자명. 없으면 null. */
  note: string | null;
}

/** 페이지에 싣는 최대 개수. 너무 많으면 페이지가 무거워지고 얇은 링크만 늘어난다. */
export const REGION_PLACE_LIMIT = 60;

interface RepairRow { shop_key: string; name: string; road_addr: string | null; jibun_addr: string | null; brand: string | null; shop_type: string | null }
interface CarwashRow { mgmt_no: string; name: string; road_addr: string | null; jibun_addr: string | null; wash_type: string | null }
interface EvRow { stat_id: string; stat_nm: string; addr: string | null; busi_nm: string | null }

/**
 * 시군구의 장소 목록. 정렬은 종류마다 다르다:
 *  - repair : 브랜드 있는 곳 먼저(지도와 같은 기준 — 알아볼 수 있는 곳이 위로)
 *  - carwash: 유형이 확정된 곳 먼저
 *  - ev     : 이름순(충전소는 '중요도' 개념이 없다)
 * 어느 경우든 마지막 키를 정렬에 넣어 같은 입력이면 같은 순서가 나오게 한다
 * (ISR 재생성 때마다 목록이 뒤바뀌면 크롤러에게 불안정한 페이지로 보인다).
 */
export async function queryPlacesBySigungu(
  layer: PlaceLayer,
  sigunguCode: string,
  limit: number = REGION_PLACE_LIMIT,
): Promise<RegionPlaceItem[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();
  try {
    if (layer === 'repair') {
      const { data, error } = await sb
        .from('repair_shops')
        .select('shop_key,name,road_addr,jibun_addr,brand,shop_type')
        .eq('sigungu_code', sigunguCode)
        .order('brand', { ascending: true, nullsFirst: false })
        .order('shop_key', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data as RepairRow[] ?? []).map((r) => ({
        key: r.shop_key,
        name: r.name,
        address: r.road_addr ?? r.jibun_addr,
        note: r.brand ?? r.shop_type ?? null,
      }));
    }
    if (layer === 'carwash') {
      const { data, error } = await sb
        .from('carwash_places')
        .select('mgmt_no,name,road_addr,jibun_addr,wash_type')
        .eq('sigungu_code', sigunguCode)
        .order('wash_type', { ascending: true })
        .order('mgmt_no', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data as CarwashRow[] ?? []).map((r) => ({
        key: r.mgmt_no,
        name: r.name,
        address: r.road_addr ?? r.jibun_addr,
        note: r.wash_type ?? null,
      }));
    }
    // ev — 충전기 단위 테이블이라 충전소(stat_id) 기준으로 접는다.
    const { data, error } = await sb
      .from('ev_chargers')
      .select('stat_id,stat_nm,addr,busi_nm')
      .eq('sigungu_code', sigunguCode)
      .order('stat_id', { ascending: true })
      .limit(limit * 12); // 한 충전소에 충전기가 여럿이라 넉넉히 받아 접는다
    if (error) throw error;
    const seen = new Set<string>();
    const out: RegionPlaceItem[] = [];
    for (const r of (data as EvRow[] ?? [])) {
      if (seen.has(r.stat_id)) continue;
      seen.add(r.stat_id);
      out.push({ key: r.stat_id, name: r.stat_nm, address: r.addr, note: r.busi_nm });
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.warn(`region places query fail (${layer}/${sigunguCode}):`, (e as Error).message);
    return [];
  }
}

/**
 * 해당 종류의 데이터가 **한 곳이라도 있는** 시군구 코드 집합.
 * generateStaticParams 에서 쓴다 — 데이터가 0곳인 지역까지 페이지를 만들면
 * 내용 없는 얇은 페이지가 수십 개 생기고, 그건 색인에 도움이 되지 않고 해가 된다.
 */
/**
 * 폴백 페이지네이션의 시간 예산(ms).
 *
 * 이 함수는 빌드의 generateStaticParams 에서 돈다. Next.js 의 staticPageGenerationTimeout
 * 기본값이 **60초**라, 여기서 넘기면 빌드가 통째로 실패한다 —
 * 실제로 2026-09-01 App Hosting 빌드가 이것 때문에 죽었다(ev_chargers 527,093행 = 약 210초).
 *
 * 세 레이어가 Promise.all 로 동시에 도므로 최악이 대략 이 값 + 오버헤드다. 빌드 컨테이너는
 * 개발 머신보다 느리므로(실측 repair 12.4초가 그쪽에선 더 걸린다) 60초에 여유를 크게 둔다.
 */
const FALLBACK_BUDGET_MS = 15_000;

/**
 * 레이어별 "데이터가 있는 시군구 코드" 집합.
 *
 * 1순위는 RPC(마이그레이션 0057) — SQL distinct 한 번이다. sigungu_code 인덱스(0048)가 있어
 * index-only scan 이 된다.
 *
 * 폴백은 기존 페이지네이션인데 **시간 예산을 둔다**. PostgREST 에 distinct 가 없어 테이블 전체를
 * 1,000행씩 훑어야 하고, 그게 정확히 빌드를 죽인 원인이었다. 예산을 넘기면 거기까지만 쓰고
 * 중단한다 — 결과가 부분집합이 되어 일부 시군구가 정적 생성에서 빠지지만, dynamicParams 기본값이
 * true 라 그 경로는 첫 방문 시 온디맨드로 렌더된다(빌드가 죽는 것보다 낫다).
 * 잘리는 쪽이 sigungu_code 오름차순 뒷번호로 **편향**되므로, 잘렸다는 사실을 반드시 로그로 남긴다.
 */
export async function queryDistrictsWithPlaces(layer: PlaceLayer): Promise<Set<string>> {
  const out = new Set<string>();
  if (!isSupabaseConfigured()) return out;
  const sb = getSupabase();

  // 1) RPC — 왕복 1회.
  try {
    const { data, error } = await sb.rpc('rpc_districts_with_places', { p_layer: layer });
    if (!error && Array.isArray(data)) {
      for (const row of data as unknown[]) {
        // setof text 는 스칼라 배열로 오지만, 드라이버/버전에 따라 객체로 감싸질 수 있어 둘 다 받는다.
        const code = typeof row === 'string' ? row : (row as { sigungu_code?: string })?.sigungu_code;
        if (code) out.add(code);
      }
      if (out.size) return out;
    }
    if (error) {
      console.warn(`[placeRegions] RPC 미사용(${layer}) — 마이그레이션 0057 미적용? ${error.message}`);
    }
  } catch (e) {
    console.warn(`[placeRegions] RPC 호출 실패(${layer}):`, (e as Error).message);
  }

  // 2) 폴백 — 페이지네이션 + 시간 예산.
  const startedAt = Date.now();
  let truncated = false;
  try {
    for (let from = 0; ; from += 1000) {
      if (Date.now() - startedAt > FALLBACK_BUDGET_MS) { truncated = true; break; }
      const { data, error } = await sb
        .from(tableFor(layer))
        .select('sigungu_code')
        .not('sigungu_code', 'is', null)
        .order('sigungu_code', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      const rows = (data as { sigungu_code: string }[]) ?? [];
      rows.forEach((r) => out.add(r.sigungu_code));
      if (rows.length < 1000) break;
      if (from > 400_000) { truncated = true; break; } // 폭주 가드
    }
  } catch (e) {
    console.warn(`districts-with-places query fail (${layer}):`, (e as Error).message);
  }
  if (truncated) {
    console.warn(
      `[placeRegions] ${layer}: 시간 예산(${FALLBACK_BUDGET_MS}ms) 초과로 중단 — 시군구 ${out.size}개만 수집했다. `
      + '뒷번호 시군구가 빠졌을 수 있다. 마이그레이션 0057을 적용하면 해소된다.',
    );
  }
  return out;
}

/** 레이어 → 테이블명. RPC 폴백에서만 쓴다. */
function tableFor(layer: PlaceLayer): string {
  return layer === 'repair' ? 'repair_shops' : layer === 'carwash' ? 'carwash_places' : 'ev_chargers';
}
