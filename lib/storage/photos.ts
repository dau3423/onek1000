// 리뷰 사진 업로드 / 서명 URL 발급 — Supabase Storage 기반
//
// 버킷 'review-photos' 정책 (콘솔에서 1회 설정):
//   - public read OFF (서명 URL로만 접근)
//   - authenticated upload (실제로는 서버 API가 service_role로 업로드)

import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

const BUCKET = 'review-photos';
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7일

export interface UploadResult {
  path: string;            // storage 경로 (DB에 저장)
  signedUrl: string;       // 즉시 표시용
}

/** 서버 사이드: 파일을 review-photos 버킷에 업로드 */
export async function uploadReviewPhoto(
  userId: string,
  file: { name: string; arrayBuffer: ArrayBuffer; type: string },
): Promise<UploadResult> {
  if (!isSupabaseConfigured()) {
    // 개발 모드: placeholder URL
    return {
      path: `mock/${userId}/${Date.now()}-${file.name}`,
      signedUrl: 'https://placehold.co/600x400/FF6B00/white?text=mock+photo',
    };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : 'jpg';
  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${safeExt}`;

  const sb = getSupabase();
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, file.arrayBuffer, {
      contentType: file.type || `image/${safeExt}`,
      upsert: false,
    });

  if (error) throw new Error(`upload failed: ${error.message}`);

  const signedUrl = await getSignedUrl(path);
  return { path, signedUrl };
}

/** 경로 → 서명 URL (만료 7일) */
export async function getSignedUrl(path: string): Promise<string> {
  if (!isSupabaseConfigured()) {
    return 'https://placehold.co/600x400/FF6B00/white?text=mock';
  }
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error) throw new Error(`signed url failed: ${error.message}`);
  return data.signedUrl;
}

/** 여러 경로를 한 번에 서명 URL로 */
export async function getSignedUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  if (!isSupabaseConfigured()) {
    return paths.map(() => 'https://placehold.co/600x400/FF6B00/white?text=mock');
  }
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SEC);
  if (error) throw new Error(`signed urls failed: ${error.message}`);
  return (data ?? []).map((d) => d.signedUrl);
}

/** 리뷰 삭제 시 사진들도 같이 정리 */
export async function deleteReviewPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0 || !isSupabaseConfigured()) return;
  const sb = getSupabase();
  await sb.storage.from(BUCKET).remove(paths);
}
