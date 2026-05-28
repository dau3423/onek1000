// 리뷰 사진 업로드 — multipart/form-data
// 클라가 사진을 form-data로 보내면 server가 service_role로 Supabase Storage에 올리고
// 'path'와 즉시 표시용 'signedUrl'을 돌려줌. 클라는 path를 모아두었다가 리뷰 POST에 첨부.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { uploadReviewPhoto } from '@/lib/storage/photos';
import { REVIEW_PHOTO_BYTE_MAX, REVIEW_PHOTO_MAX } from '@/types/review';

export const runtime = 'nodejs';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = (session.user as any).id ?? session.user.email;

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'multipart/form-data expected' }, { status: 400 }); }

  const files = form.getAll('photos').filter((v): v is File => v instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'no files' }, { status: 400 });
  if (files.length > REVIEW_PHOTO_MAX) {
    return NextResponse.json({ error: `max ${REVIEW_PHOTO_MAX} files` }, { status: 400 });
  }

  const results: Array<{ path: string; signedUrl: string }> = [];
  const errors: string[] = [];

  for (const f of files) {
    if (!ACCEPT.includes(f.type)) {
      errors.push(`${f.name}: unsupported type ${f.type}`);
      continue;
    }
    if (f.size > REVIEW_PHOTO_BYTE_MAX) {
      errors.push(`${f.name}: too large (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
      continue;
    }
    try {
      const buf = await f.arrayBuffer();
      const r = await uploadReviewPhoto(userId, { name: f.name, arrayBuffer: buf, type: f.type });
      results.push(r);
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ uploaded: results, errors });
}
