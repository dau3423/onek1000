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
 * [배포 안전성] 코드가 마이그레이션(0034)보다 먼저 배포되는 창에서 채널 컬럼이 아직 없을 수
 * 있다. 이때 채널 필드 포함 upsert는 PostgREST 컬럼 부재 에러(error)를 돌려주는데, 그대로
 * 두면 방문 자체가 유실된다. 그래서 채널 필드 포함 upsert가 실패하면 채널 없이 기존 3필드만으로
 * 1회 fallback upsert를 재시도한다 → 채널값이 있는 방문도 최소한 방문 자체는 절대 유실되지 않는다.
 */
export async function recordVisit(
  device_id: string,
  user_id: string | null,
  channel?: VisitChannel,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const base: Record<string, unknown> = { visit_date: kstTodayDate(), device_id, user_id };
  // 값이 있는 채널 필드만 수집 — 전부 null/미전달이면 예전과 동일하게 3필드만 insert.
  const channelFields: Record<string, unknown> = {};
  if (channel) {
    if (channel.ref_host) channelFields.ref_host = channel.ref_host;
    if (channel.utm_source) channelFields.utm_source = channel.utm_source;
    if (channel.utm_medium) channelFields.utm_medium = channel.utm_medium;
    if (channel.utm_campaign) channelFields.utm_campaign = channel.utm_campaign;
  }
  const opts = { onConflict: 'visit_date,device_id', ignoreDuplicates: true } as const;
  try {
    const sb = getSupabase();
    if (Object.keys(channelFields).length > 0) {
      // 1차: 채널 컬럼 포함. ignoreDuplicates라 중복 충돌은 error가 아니므로, error가 오면
      // 컬럼 부재(0034 미적용) 등 실제 실패다 → 방문 유실 방지를 위해 아래 fallback로 넘어간다.
      const { error } = await sb.from('page_visits').upsert({ ...base, ...channelFields }, opts);
      if (!error) return;
    }
    // fallback(또는 채널 없음): 기존 3필드만으로 방문을 기록 — 방문 자체는 절대 유실하지 않는다.
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
