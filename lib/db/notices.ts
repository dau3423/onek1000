// 공지(notices) 도메인 쿼리 — 단일 활성 공지 정책.
// Supabase 미설정(mock) 시에는 공지 없음(null)으로 graceful 폴백한다.

import { getSupabase, isSupabaseConfigured } from './supabase';
import { deleteNoticeImage } from '@/lib/storage/notices';
import type { Notice } from '@/types/notice';

interface NoticeRow {
  id: string;
  image_url: string;
  image_path: string | null;
  link_url: string | null;
  is_active: boolean;
  created_at: string;
}

function rowToNotice(r: NoticeRow): Notice {
  return {
    id: r.id,
    imageUrl: r.image_url,
    imagePath: r.image_path,
    linkUrl: r.link_url,
    createdAt: r.created_at,
  };
}

/**
 * 개발(mock) 폴백 공지 — Supabase 미설정 시 환경변수로 팝업을 미리볼 수 있게 한다.
 *  - MOCK_NOTICE_IMAGE_URL 가 있으면 그 이미지를 활성 공지로 노출(MOCK_NOTICE_LINK_URL 선택).
 *  - 미설정이면 null(공지 없음 → 팝업 미표시). 실서버(Supabase 설정)에선 이 분기 자체가 안 탄다.
 */
function mockNotice(): Notice | null {
  const img = process.env.MOCK_NOTICE_IMAGE_URL;
  if (!img) return null;
  return {
    id: 'mock-notice',
    imageUrl: img,
    imagePath: null,
    linkUrl: process.env.MOCK_NOTICE_LINK_URL || null,
  };
}

/** 현재 노출할 활성 공지 1건(없으면 null). 공개 API/팝업용. */
export async function getActiveNotice(): Promise<Notice | null> {
  if (!isSupabaseConfigured()) return mockNotice();
  const sb = getSupabase();
  const { data, error } = await sb
    .from('notices')
    .select('id, image_url, image_path, link_url, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return rowToNotice(data as NoticeRow);
}

/**
 * 가장 최근 공지 1건(활성 여부 무관). 관리 화면에서 현재 공지를 보여주고
 * 켜고 끄기(토글)를 하기 위한 조회 — 꺼져 있어도 이미지/링크를 유지·표시한다.
 */
export async function getLatestNotice(): Promise<(Notice & { isActive: boolean }) | null> {
  if (!isSupabaseConfigured()) {
    const m = mockNotice();
    return m ? { ...m, isActive: true } : null;
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('notices')
    .select('id, image_url, image_path, link_url, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as NoticeRow;
  return { ...rowToNotice(row), isActive: row.is_active };
}

/**
 * 새 공지 등록(단일 활성):
 *  1) 기존 활성 공지를 모두 비활성화하고(이전 이미지는 best-effort 정리),
 *  2) 새 공지를 is_active=true로 삽입한다.
 * 반환: 생성된 공지.
 */
export async function createNotice(input: {
  imageUrl: string;
  imagePath: string;
  linkUrl: string | null;
}): Promise<Notice> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }
  const sb = getSupabase();

  // 1) 이전 활성 공지 비활성화 + 이미지 정리(best-effort).
  const { data: prev } = await sb
    .from('notices')
    .select('id, image_path')
    .eq('is_active', true);
  if (Array.isArray(prev) && prev.length > 0) {
    await sb.from('notices').update({ is_active: false }).eq('is_active', true);
    await Promise.all(prev.map((p) => deleteNoticeImage((p as { image_path: string | null }).image_path)));
  }

  // 2) 새 공지 삽입.
  const { data, error } = await sb
    .from('notices')
    .insert({
      image_url: input.imageUrl,
      image_path: input.imagePath,
      link_url: input.linkUrl,
      is_active: true,
    })
    .select('id, image_url, image_path, link_url, is_active, created_at')
    .single();
  if (error || !data) throw new Error(`createNotice failed: ${error?.message ?? 'no data'}`);
  return rowToNotice(data as NoticeRow);
}

/**
 * 가장 최근 공지의 노출 on/off 토글(이미지는 보존 — 다시 켤 수 있다).
 *  - active=true : 단일 활성 정책 유지를 위해 모든 공지를 끈 뒤 최신 공지만 켠다.
 *  - active=false: 최신 공지를 끈다(이미지/링크는 그대로 남겨 재활성 가능).
 * 공지가 하나도 없으면 아무것도 하지 않고 null 반환.
 */
export async function setNoticeActive(
  active: boolean,
): Promise<(Notice & { isActive: boolean }) | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const latest = await getLatestNotice();
  if (!latest) return null;

  if (active) {
    // 단일 활성: 우선 전부 끄고(멱등), 최신만 켠다.
    await sb.from('notices').update({ is_active: false }).eq('is_active', true);
    await sb.from('notices').update({ is_active: true }).eq('id', latest.id);
  } else {
    await sb.from('notices').update({ is_active: false }).eq('id', latest.id);
  }
  return { ...latest, isActive: active };
}
