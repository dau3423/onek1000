// 관리자 전용 — 공지 등록(이미지 업로드)/노출 중단.
// 가드: 세션 이메일이 ADMIN_EMAILS에 포함될 때만 허용(아니면 404로 존재 비노출).
//
//  POST   multipart/form-data { image: File, linkUrl?: string }
//         → notices 버킷에 업로드 + 새 활성 공지 생성(이전 활성은 비활성+이미지 정리). { notice }
//  PATCH  application/json { active: boolean }
//         → 최신 공지 노출 on/off 토글(이미지는 보존 — 다시 켤 수 있음). { notice }

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isAdminEmail } from '@/lib/auth/admin';
import { uploadNoticeImage } from '@/lib/storage/notices';
import { createNotice, setNoticeActive } from '@/lib/db/notices';
import { NOTICE_IMAGE_ACCEPT, NOTICE_IMAGE_BYTE_MAX } from '@/types/notice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (session?.revoked) return false;
  return isAdminEmail(session?.user?.email);
}

/** linkUrl 검증: 내부 경로('/...') 또는 http(s) 절대 URL만 허용. 빈 값이면 null. */
function normalizeLinkUrl(raw: string | null): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (v.startsWith('/')) return v;
  try {
    const u = new URL(v);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {
    /* invalid */
  }
  return null;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'multipart/form-data expected' }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'image file required' }, { status: 400 });
  }
  if (!(NOTICE_IMAGE_ACCEPT as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: `unsupported type ${file.type}` }, { status: 400 });
  }
  if (file.size > NOTICE_IMAGE_BYTE_MAX) {
    return NextResponse.json(
      { error: `too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 5MB)` },
      { status: 400 },
    );
  }

  const linkUrl = normalizeLinkUrl(form.get('linkUrl') as string | null);

  try {
    const buf = await file.arrayBuffer();
    const { path, publicUrl } = await uploadNoticeImage({
      name: file.name,
      arrayBuffer: buf,
      type: file.type,
    });
    const notice = await createNotice({ imageUrl: publicUrl, imagePath: path, linkUrl });
    return NextResponse.json({ notice });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  let body: { active?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'json body expected' }, { status: 400 });
  }
  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'active(boolean) required' }, { status: 400 });
  }
  const notice = await setNoticeActive(body.active);
  if (!notice) {
    return NextResponse.json({ error: 'no notice to toggle' }, { status: 404 });
  }
  return NextResponse.json({ notice });
}
