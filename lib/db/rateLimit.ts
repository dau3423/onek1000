// IP 레이트리밋 (DB 백엔드, 마이그레이션 0056)
//
// Upstash Redis 를 도입하지 않고 DB 로 처리한다 — 이미 쓰는 Supabase 로 충분하고,
// 프로덕션에 Upstash 가 설정된 적이 없어 레이트리밋이 사실상 없는 상태였다.

import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

let missingFnWarned = false;
const WARN_THROTTLE_MS = 60_000;
let lastWarnAt = 0;

/** 0056 미적용 판정 — PostgREST 는 없는 함수에 PGRST202 를, Postgres 는 42883 을 준다. */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  const msg = error.message ?? '';
  return /could not find the function/i.test(msg) || /does not exist/i.test(msg);
}

function warn(error: { code?: string; message?: string } | null) {
  if (isMissingFunction(error)) {
    if (!missingFnWarned) {
      missingFnWarned = true;
      console.warn('[rateLimit] migration 0056 미적용 — 레이트리밋 없이 동작한다(기존과 동일)');
    }
    return;
  }
  const now = Date.now();
  if (now - lastWarnAt < WARN_THROTTLE_MS) return;
  lastWarnAt = now;
  console.warn('[rateLimit] 카운터 증가 실패', error?.message ?? error);
}

/**
 * 버킷 카운터를 1 올리고 현재 윈도우의 누적 횟수를 돌려준다.
 *
 * @returns 이번 요청 포함 누적 횟수. **실패 시 0**(= 호출부에서 '통과'로 해석).
 *
 * 실패 시 통과시키는 이유(fail-open): 레이트리밋은 남용 방어이지 기능이 아니다. 저장소 장애로
 * 정상 사용자를 막으면 장애를 키운다. 0056 미적용 환경에서도 앱이 그대로 동작한다.
 */
export async function hitRateLimit(bucket: string, windowSec: number): Promise<number> {
  if (!isSupabaseConfigured()) return 0; // mock/로컬 — 제한 없음(기존 동작 유지)
  try {
    const { data, error } = await getSupabase().rpc('rpc_rate_limit_hit', {
      p_bucket: bucket,
      p_window_sec: windowSec,
    });
    if (error) { warn(error); return 0; }
    return typeof data === 'number' ? data : 0;
  } catch (e) {
    warn(e as { message?: string });
    return 0;
  }
}
