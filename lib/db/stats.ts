// 방문자 통계 — 서버 전용.
// page_visits 테이블에 디바이스 기준 고유 방문을 기록하고, 오늘 방문자 수를 집계한다.
// Supabase 미설정/조회 실패 시에는 null/no-op으로 graceful 처리한다(방문 ping이
// 사용자 경험을 깨뜨리지 않도록, 대시보드는 '-'로 안전 폴백).
// 유입 채널 컬럼(0034)이 아직 없는 배포 창에서도 recordVisit은 채널 없는 fallback으로
// 방문 자체를 유실 없이 남긴다(자세한 동작은 recordVisit docstring 참고).

import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

const KST_OFFSET_MS = 9 * 3600 * 1000;

/**
 * KST(UTC+9) 기준 오늘 날짜를 YYYY-MM-DD 문자열로 반환.
 * page_visits.visit_date(date)와 비교/저장하는 기준값. API와 통계가 공유한다.
 */
export function kstTodayDate(): string {
  // UTC 시각에 +9h를 더한 뒤 UTC 기준 날짜 부분만 떼면 KST 자정 경계의 날짜가 된다.
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 유입 채널(모두 선택) — referrer 호스트 + utm 3종. 개인정보성 값은 담지 않는다. */
export interface VisitChannel {
  ref_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

/**
 * 방문 1건 기록(upsert) — (visit_date, device_id) 유니크라 하루 1디바이스 1행.
 * 중복 호출은 무해한 no-op. Supabase 미설정/에러 시에도 throw하지 않고 조용히 넘어간다.
 *
 * 유입 채널(channel)은 하루 첫 방문에만 남는다(ignoreDuplicates 특성상 첫 행만 insert되는
 * first-touch — 의도된 동작).
 *
 * 접속 지역(sido_code, 0035)도 채널과 동일한 first-touch 의미론으로 하루 첫 방문에만 남는다.
 * IP 원본은 여기(및 어디에도) 저장하지 않는다 — 서버(/api/visit)가 IP를 시도 코드로 변환한
 * 결과만 넘어온다(0029 IP 미저장 원칙).
 *
 * [배포 안전성] 코드가 마이그레이션(0034 채널 / 0035 지역)보다 먼저 배포되는 창에서 해당 컬럼이
 * 아직 없을 수 있다. 이때 그 필드를 포함한 upsert는 PostgREST 컬럼 부재 에러(error)를 돌려주는데,
 * 그대로 두면 방문 자체가 유실된다. 그래서 실패하면 단계적으로 필드를 덜어내며 재시도한다:
 *   전체(채널+지역) → 채널만(지역 제외, 0035 미적용 방어) → base 3필드만.
 * 어느 단계에서 성공하든 방문 자체는 절대 유실되지 않는다.
 */
export async function recordVisit(
  device_id: string,
  user_id: string | null,
  channel?: VisitChannel,
  sido_code?: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const base: Record<string, unknown> = { visit_date: kstTodayDate(), device_id, user_id };
  // 값이 있는 채널 필드만 수집(0034) — 전부 null/미전달이면 예전과 동일하게 base만 insert.
  const channelFields: Record<string, unknown> = {};
  if (channel) {
    if (channel.ref_host) channelFields.ref_host = channel.ref_host;
    if (channel.utm_source) channelFields.utm_source = channel.utm_source;
    if (channel.utm_medium) channelFields.utm_medium = channel.utm_medium;
    if (channel.utm_campaign) channelFields.utm_campaign = channel.utm_campaign;
  }
  // 접속 지역(0035) — 값이 있을 때만 포함.
  const sidoField: Record<string, unknown> = sido_code ? { sido_code } : {};
  const hasChannel = Object.keys(channelFields).length > 0;
  const hasSido = Object.keys(sidoField).length > 0;
  const opts = { onConflict: 'visit_date,device_id', ignoreDuplicates: true } as const;
  try {
    const sb = getSupabase();
    // 1차: 전체(채널+지역). ignoreDuplicates라 중복 충돌은 error가 아니므로, error면 컬럼 부재 등
    // 실제 실패다 → 방문 유실 방지를 위해 아래 단계로 넘어간다.
    if (hasChannel || hasSido) {
      const { error } = await sb.from('page_visits').upsert({ ...base, ...channelFields, ...sidoField }, opts);
      if (!error) return;
    }
    // 2차: 지역 컬럼(0035)만 제외하고 채널까지는 유지 — 0035 미적용 창에서 채널 데이터 유실 최소화.
    if (hasSido && hasChannel) {
      const { error } = await sb.from('page_visits').upsert({ ...base, ...channelFields }, opts);
      if (!error) return;
    }
    // 3차 fallback: base 3필드만 — 방문 자체는 절대 유실하지 않는다.
    await sb.from('page_visits').upsert(base, opts);
  } catch {
    /* 방문 기록 실패는 무시(사용자 경험 우선) */
  }
}

/**
 * 퍼널 이벤트 1건 기록. 방문 기록과 동일하게 throw 없이 graceful 처리(분석이 UX를 깨면 안 됨).
 * visit_date(KST)는 서버에서 계산해 저장 → 일자별 집계가 단순해진다.
 */
export async function recordEvent(
  event: string,
  device_id: string,
  user_id: string | null,
  props: Record<string, unknown> | null,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    await sb.from('funnel_events').insert({
      event,
      device_id,
      user_id,
      props: props ?? null,
      visit_date: kstTodayDate(),
    });
  } catch {
    /* 이벤트 기록 실패는 무시(사용자 경험 우선) */
  }
}

/**
 * 오늘(KST) 이벤트별 고유 디바이스 수. { signin_view: 12, oauth_click: 4, ... }.
 * RPC(funnel_counts) 미적용/실패 시 null → 대시보드 '-' 폴백.
 */
export async function getTodayFunnel(): Promise<Record<string, number> | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc('funnel_counts', { d: kstTodayDate() });
    if (error || !data) return null;
    const out: Record<string, number> = {};
    for (const row of data as Array<{ event: string; devices: number }>) {
      out[row.event] = Number(row.devices) || 0;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 리텐션 프록시: 서로 다른 날짜에 2회 이상 방문한 로그인 사용자 수. 미설정/실패 시 null.
 */
export async function getReturningUserCount(): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc('returning_user_count');
    return error ? null : (typeof data === 'number' ? data : null);
  } catch {
    return null;
  }
}

/**
 * 비교용: page_visits에 잡힌 고유 로그인 사용자 수(리텐션 분모). 미설정/실패 시 null.
 */
export async function getSignedInUserCount(): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc('signed_in_user_count');
    return error ? null : (typeof data === 'number' ? data : null);
  } catch {
    return null;
  }
}

/**
 * 디바이스 기준 D1 재방문율(%) — "최근 7일 평균". RPC(retention_d1) 미적용/실패/데이터부족 시 null.
 * 기준일에 방문한 고유 디바이스 중 익일에도 방문한 비율의, 최근 7개 기준일 평균.
 */
export async function getRetentionD1(days = 7): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc('retention_d1', { days });
    // RPC는 returns numeric — Postgres numeric이 JSON 문자열('12.5')로 올 수 있어 Number()로 보정.
    // 데이터부족은 null(→ '-'), 값이 오면 유한수만 채택(NaN이면 null로 안전 폴백).
    if (error || data == null) return null;
    const n = Number(data);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * 디바이스 기준 D7 재방문율(%) — "최근 4주 평균". RPC(retention_d7) 미적용/실패/데이터부족 시 null.
 * 기준일에 방문한 고유 디바이스 중 정확히 7일 뒤에 방문한 비율의, 최근 4주(28개 기준일) 평균.
 */
export async function getRetentionD7(weeks = 4): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc('retention_d7', { weeks });
    // RPC는 returns numeric — 문자열로 올 수 있어 Number() 보정 + 데이터부족(null)/NaN 가드.
    if (error || data == null) return null;
    const n = Number(data);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** 채널 집계 1건 — 채널명 + 방문 수. */
export interface ChannelCount {
  channel: string;
  visits: number;
}

/**
 * 오늘(KST) 유입 채널 상위 N개(기본 3). 채널=utm_source>ref_host>'직접'.
 * RPC(visit_channels) 미적용/실패 시 null → 대시보드 '-' 폴백.
 */
export async function getTodayChannels(limit = 3): Promise<ChannelCount[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc('visit_channels', { d: kstTodayDate() });
    if (error || !data) return null;
    return (data as Array<{ channel: string; visits: number }>)
      .slice(0, limit)
      .map((r) => ({ channel: String(r.channel), visits: Number(r.visits) || 0 }));
  } catch {
    return null;
  }
}

/** 시도별 방문 집계 1건 — sidoCode(null='미상') + 방문 수. */
export interface RegionVisitRow {
  /** Opinet 시도 코드('01'~'19'). 지역 추정 실패(GeoIP 미도입/실패)는 null('미상'). */
  sidoCode: string | null;
  visits: number;
}

// [Mock 고정 집계] 지도·표 UI는 데이터가 없으면 검증 자체가 불가하므로, 다른 카드들의 '-' 폴백
// 관례를 의도적으로 이탈해 17개 시도 + '미상'(NULL)의 고정 목 집계를 반환한다(plan Mock 전략).
// 값 분포는 분위(quantile) 4단계가 실제로 갈리도록 설계했다(전부 동일값 금지 — design.md 예시).
const MOCK_REGION_VISITS: RegionVisitRow[] = [
  { sidoCode: '01', visits: 132 }, // 서울
  { sidoCode: '02', visits: 118 }, // 경기
  { sidoCode: '15', visits: 41 }, // 인천
  { sidoCode: '10', visits: 38 }, // 부산
  { sidoCode: '09', visits: 27 }, // 경남
  { sidoCode: '14', visits: 24 }, // 대구
  { sidoCode: '05', visits: 19 }, // 충남
  { sidoCode: '08', visits: 17 }, // 경북
  { sidoCode: '17', visits: 15 }, // 대전
  { sidoCode: '06', visits: 12 }, // 전북
  { sidoCode: '16', visits: 11 }, // 광주
  { sidoCode: '18', visits: 9 }, // 울산
  { sidoCode: '03', visits: 8 }, // 강원
  { sidoCode: '04', visits: 7 }, // 충북
  { sidoCode: '07', visits: 6 }, // 전남
  { sidoCode: '11', visits: 4 }, // 제주
  { sidoCode: '19', visits: 2 }, // 세종
  { sidoCode: null, visits: 33 }, // 미상(지역 추정 실패)
];

/**
 * 최근 days일(KST, 오늘 포함) 시도별 방문 수. NULL 그룹('미상')도 포함해 반환한다.
 * getTodayChannels 패턴 + Mock 분기: RPC(visit_regions, 0035) 미적용/실패 시 null → 섹션 폴백.
 * Mock 모드(NEXT_PUBLIC_USE_MOCK 또는 Supabase 미설정)에서는 고정 목 집계를 반환한다(위 주석 참조).
 */
export async function getRegionVisits(days = 7): Promise<RegionVisitRow[] | null> {
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()) {
    return MOCK_REGION_VISITS;
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc('visit_regions', { days });
    if (error || !data) return null;
    return (data as Array<{ sido_code: string | null; visits: number }>).map((r) => ({
      sidoCode: r.sido_code == null ? null : String(r.sido_code),
      visits: Number(r.visits) || 0,
    }));
  } catch {
    return null;
  }
}

/**
 * 오늘(KST) 고유 방문 디바이스 수. 미설정/실패 시 null → 대시보드에서 '-' 표시.
 */
export async function getTodayVisitorCount(): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const { count, error } = await sb
      .from('page_visits')
      .select('*', { count: 'exact', head: true })
      .eq('visit_date', kstTodayDate());
    return error ? null : count ?? null;
  } catch {
    return null;
  }
}

/**
 * 최근 N일 로그인 게이트 발동 분포 — **어느 기능이 비회원을 로그인 화면으로 돌려세우는가**.
 *
 * 왜 필요한가(실측 2026-08-25): 28일간 지도 진입 1,038명 중 로그인 화면까지 간 사람이
 * 26명(2.5%)뿐이었는데, signIn() 을 여기저기서 직접 부르고 있어 **어느 게이트가 원인인지
 * 가릴 수 없었다**. 이제 requireLogin(reason) 이 auth_gate 를 남기므로 여기서 집계한다.
 *
 * 디바이스 기준(고유 수)으로 센다 — 한 사람이 같은 버튼을 여러 번 눌러도 1로 본다.
 * 실패/미설정 시 null → 대시보드가 '-' 로 표시한다.
 */
export async function getAuthGateBreakdown(days = 7): Promise<Array<{ reason: string; devices: number }> | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    const since = new Date(Date.now() - days * 86400000).toISOString();
    // props 를 서버에서 그룹핑할 수단이 없어(자유 jsonb) 행을 받아 집계한다.
    // auth_gate 는 비회원이 막힐 때만 찍혀 양이 적다 — 상한을 둬 폭주를 막는다.
    const { data, error } = await sb
      .from('funnel_events')
      .select('device_id, props')
      .eq('event', 'auth_gate')
      .gte('created_at', since)
      .limit(5000);
    if (error || !data) return null;
    const byReason = new Map<string, Set<string>>();
    for (const row of data as Array<{ device_id: string | null; props: { reason?: unknown } | null }>) {
      const reason = typeof row.props?.reason === 'string' ? row.props.reason : '(미상)';
      const set = byReason.get(reason) ?? new Set<string>();
      set.add(row.device_id ?? '');
      byReason.set(reason, set);
    }
    return [...byReason.entries()]
      .map(([reason, set]) => ({ reason, devices: set.size }))
      .sort((a, b) => b.devices - a.devices);
  } catch {
    return null;
  }
}
