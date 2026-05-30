// 닉네임 DB 헬퍼 (서버 전용) — 유니크 확보/조회.
// Supabase 미설정(mock) 시에도 흐름이 깨지지 않도록 폴백한다.

import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import {
  NICKNAME_MAX,
  generateNickname,
  generateNicknameCandidates,
  normalizeNickname,
} from '@/lib/nickname';

/**
 * 정규화 기준으로 닉네임이 이미 사용 중인지 검사.
 * @param excludeUserId 본인 레코드는 제외(닉네임 변경 시 자기 자신과의 충돌 방지)
 */
export async function isNicknameTaken(nickname: string, excludeUserId?: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const sb = getSupabase();
  const norm = normalizeNickname(nickname);
  // 후보가 적으므로 클라이언트 측 정규화로 비교(소량 데이터 가정 X → 우선 ilike로 좁힌 뒤 정규화 비교)
  let query = sb.from('users').select('id, nickname').not('nickname', 'is', null);
  if (excludeUserId) query = query.neq('id', excludeUserId);
  const { data } = await query;
  return (data ?? []).some((r) => normalizeNickname((r.nickname as string) ?? '') === norm);
}

/**
 * DB에서 유니크한 닉네임을 생성한다(첫 로그인용).
 * 후보를 순차 시도하고, 모두 충돌하면 숫자 접미로 강제 유니크화한다.
 * Supabase 미설정 시 검사 없이 후보 1개를 반환.
 */
export async function generateUniqueNickname(): Promise<string> {
  if (!isSupabaseConfigured()) return generateNickname(true);

  for (const cand of generateNicknameCandidates(8)) {
    if (!(await isNicknameTaken(cand))) return cand;
  }
  // 마지막 방어: 숫자 접미를 늘려가며 시도
  for (let i = 0; i < 5; i++) {
    const cand = generateNickname(true);
    if (!(await isNicknameTaken(cand))) return cand;
  }
  // 그래도 못 찾으면 타임스탬프 접미(유니크 인덱스 위반 회피).
  // NICKNAME_MAX(10자)를 넘지 않도록 base를 잘라 6자리 접미를 붙인다.
  const stamp = String(Date.now()).slice(-6); // 6자리
  const base = generateNickname(false).slice(0, NICKNAME_MAX - stamp.length); // 최대 4자
  return base + stamp;
}
