// 방문자 통계 — 서버 전용.
// page_visits 테이블에 디바이스 기준 고유 방문을 기록하고, 오늘 방문자 수를 집계한다.
// Supabase 미설정/조회 실패 시에는 null/no-op으로 graceful 처리한다(방문 ping이
// 사용자 경험을 깨뜨리지 않도록, 대시보드는 '-'로 안전 폴백).

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

/**
 * 방문 1건 기록(upsert) — (visit_date, device_id) 유니크라 하루 1디바이스 1행.
 * 중복 호출은 무해한 no-op. Supabase 미설정/에러 시에도 throw하지 않고 조용히 넘어간다.
 */
export async function recordVisit(device_id: string, user_id: string | null): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    await sb
      .from('page_visits')
      .upsert(
        { visit_date: kstTodayDate(), device_id, user_id },
        { onConflict: 'visit_date,device_id', ignoreDuplicates: true },
      );
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
