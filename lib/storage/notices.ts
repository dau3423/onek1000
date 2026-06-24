// 공지 이미지 업로드 — Supabase Storage('notices', 공개 read) 기반.
//
// 버킷 'notices' 정책(0030 마이그레이션에서 생성):
//   - public read ON (공개 URL을 그대로 DB(image_url)에 저장 — 만료 없는 안정 링크)
//   - 업로드는 서버 API가 service_role로만 수행(관리자 전용).
// 리뷰 사진(review-photos, 비공개+서명URL)과 달리, 공지 이미지는 민감정보가 아니라 공개 버킷을 쓴다.

import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';

const BUCKET = 'notices';

export interface NoticeUploadResult {
  path: string;       // storage 경로(DB image_path — 교체 시 정리용)
  publicUrl: string;  // 공개 URL(DB image_url — 팝업 표시용)
}

/** 서버 사이드: 파일을 notices 버킷에 업로드하고 공개 URL을 돌려준다. */
export async function uploadNoticeImage(
  file: { name: string; arrayBuffer: ArrayBuffer; type: string },
): Promise<NoticeUploadResult> {
  if (!isSupabaseConfigured()) {
    // 개발 모드(키 없음): placeholder URL
    return {
      path: `mock/${Date.now()}-${file.name}`,
      publicUrl: 'https://placehold.co/600x800/FF6B00/white?text=notice',
    };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const id = crypto.randomUUID();
  const path = `${id}.${safeExt}`;

  const sb = getSupabase();
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, file.arrayBuffer, {
      contentType: file.type || `image/${safeExt}`,
      upsert: false,
    });
  if (error) throw new Error(`notice upload failed: ${error.message}`);

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

/** 공지 교체/비활성 시 이전 이미지 정리(best-effort). 실패는 무시한다. */
export async function deleteNoticeImage(path: string | null | undefined): Promise<void> {
  if (!path || !isSupabaseConfigured()) return;
  try {
    const sb = getSupabase();
    await sb.storage.from(BUCKET).remove([path]);
  } catch {
    /* best-effort — 정리 실패는 무시(공지 동작엔 영향 없음) */
  }
}
