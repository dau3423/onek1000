// 프로필(닉네임/프로필 사진) — 로그인 필요, 본인 스코프
// GET: 현재 닉네임/사진 + (선택) 닉네임 사용 가능 여부 확인(?check=...)
// PATCH: 닉네임 변경(형식 검증 + 중복 검사 → 409). DB 유니크 인덱스로 최종 방어.
//        또는 { resetImage: true }로 프로필 사진을 소셜 기본값으로 되돌림.
// POST: 프로필 사진 업로드(multipart/form-data, field 'avatar') → users.image_url 저장.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { validateNickname } from '@/lib/nickname';
import { isNicknameTaken } from '@/lib/nickname-db';
import { uploadAvatar } from '@/lib/storage/avatars';
import { REVIEW_PHOTO_BYTE_MAX } from '@/types/review';

export const runtime = 'nodejs';

const AVATAR_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

async function getUserId(email: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  const { data } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const check = new URL(req.url).searchParams.get('check');

  // Mock/미설정: 세션 닉네임만 반환, 중복 확인은 항상 사용 가능으로 응답
  if (!isSupabaseConfigured()) {
    if (check !== null) {
      const v = validateNickname(check);
      return NextResponse.json({ available: v.ok, error: v.error });
    }
    return NextResponse.json({
      nickname: session.user.nickname ?? null,
      image: session.user.image ?? null,
    });
  }

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ nickname: null, image: null });

  if (check !== null) {
    const v = validateNickname(check);
    if (!v.ok) return NextResponse.json({ available: false, error: v.error });
    const taken = await isNicknameTaken(v.value, userId);
    return NextResponse.json({
      available: !taken,
      error: taken ? '이미 사용 중인 닉네임이에요.' : undefined,
    });
  }

  const sb = getSupabase();
  const { data } = await sb.from('users').select('nickname, image_url').eq('id', userId).maybeSingle();
  return NextResponse.json({
    nickname: (data?.nickname as string | null) ?? null,
    image: (data?.image_url as string | null) ?? null,
  });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const body = (await req.json()) as { nickname?: string; resetImage?: boolean };

  // 프로필 사진 되돌리기: image_url을 비워 다음 로그인 시 소셜 이미지로 백필되게 함.
  if (body.resetImage) {
    const userId = await getUserId(session.user.email);
    if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });
    const sb = getSupabase();
    const { error } = await sb.from('users').update({ image_url: null }).eq('id', userId);
    if (error) return NextResponse.json({ error: '변경에 실패했어요.' }, { status: 500 });
    return NextResponse.json({ image: null });
  }

  const v = validateNickname(body.nickname ?? '');
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  // 중복 검사(본인 제외) → 사용자 피드백
  if (await isNicknameTaken(v.value, userId)) {
    return NextResponse.json({ error: '이미 사용 중인 닉네임이에요.' }, { status: 409 });
  }

  const sb = getSupabase();
  const { error } = await sb.from('users').update({ nickname: v.value }).eq('id', userId);
  if (error) {
    // 유니크 인덱스 위반(동시성 경쟁) 등 DB 레벨 방어
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 사용 중인 닉네임이에요.' }, { status: 409 });
    }
    return NextResponse.json({ error: '변경에 실패했어요.' }, { status: 500 });
  }

  return NextResponse.json({ nickname: v.value });
}

// ─── POST: 프로필 사진 업로드 (multipart/form-data, field 'avatar') ───
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'multipart/form-data expected' }, { status: 400 }); }

  const file = form.get('avatar');
  if (!(file instanceof File)) return NextResponse.json({ error: 'no file' }, { status: 400 });
  if (!AVATAR_ACCEPT.includes(file.type)) {
    return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요.' }, { status: 400 });
  }
  if (file.size > REVIEW_PHOTO_BYTE_MAX) {
    return NextResponse.json({ error: '사진 용량은 5MB 이하만 가능해요.' }, { status: 400 });
  }

  // Mock/미설정: 저장 없이 placeholder URL 반환(흐름 유지)
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ image: 'https://placehold.co/200x200/FF6B00/white?text=me' });
  }

  const userId = await getUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  let imageUrl: string;
  try {
    const buf = await file.arrayBuffer();
    imageUrl = await uploadAvatar(userId, { name: file.name, arrayBuffer: buf, type: file.type });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const sb = getSupabase();
  const { error } = await sb.from('users').update({ image_url: imageUrl }).eq('id', userId);
  if (error) return NextResponse.json({ error: '저장에 실패했어요.' }, { status: 500 });

  return NextResponse.json({ image: imageUrl });
}
