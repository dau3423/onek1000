// 프로필(아바타) 사진 업로드 — Supabase Storage 기반
//
// 리뷰 사진(review-photos)과 달리 아바타는 users.image_url에 "영속 URL"로 저장돼야 한다
// (헤더/마이페이지/리뷰 작성자 표시에 장기간 사용 → 7일 만료 서명 URL은 부적합).
// 따라서 별도 'avatars' 버킷을 공개 read로 두고 public URL을 돌려준다.
//
// 버킷 'avatars' 정책 (콘솔에서 1회 설정):
//   - public read ON (아바타는 공개 표시용)
//   - 업로드는 서버 API가 service_role로만 수행

import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

const BUCKET = 'avatars';

/** 서버 사이드: 파일을 avatars 버킷에 업로드하고 공개 URL을 반환 */
export async function uploadAvatar(
  userId: string,
  file: { name: string; arrayBuffer: ArrayBuffer; type: string },
): Promise<string> {
  if (!isSupabaseConfigured()) {
    // 개발 모드: placeholder URL
    return 'https://placehold.co/200x200/FF6B00/white?text=me';
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : 'jpg';
  // 사용자당 단일 경로로 고정 → 변경 시 자동 덮어쓰기(upsert). 캐시 무력화는 쿼리스트링으로.
  const path = `${userId}/avatar.${safeExt}`;

  const sb = getSupabase();
  const { error } = await sb.storage.from(BUCKET).upload(path, file.arrayBuffer, {
    contentType: file.type || `image/${safeExt}`,
    upsert: true,
  });
  if (error) throw new Error(`avatar upload failed: ${error.message}`);

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  // 동일 경로 덮어쓰기 시 CDN/브라우저 캐시 갱신을 위해 버전 쿼리 부여
  return `${data.publicUrl}?v=${Date.now()}`;
}
