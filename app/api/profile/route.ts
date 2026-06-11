// 프로필(닉네임/프로필 사진/알림톡 동의) — 로그인 필요, 본인 스코프
// GET: 현재 닉네임/사진/알림톡 동의 + (선택) 닉네임 사용 가능 여부 확인(?check=...)
// PATCH: 닉네임 변경(형식 검증 + 중복 검사 → 409). DB 유니크 인덱스로 최종 방어.
//        또는 { resetImage: true }로 프로필 사진을 소셜 기본값으로 되돌림.
//        또는 { alimtalkOptIn: boolean }로 카카오 알림톡 수신 동의 토글.
//        또는 { forecastNotifyOptIn: boolean }로 주유 타이밍(가격 인상) 예측 알림 수신 토글.
// POST: 프로필 사진 업로드(multipart/form-data, field 'avatar') → users.image_url 저장.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { validateNickname } from '@/lib/nickname';
import { isNicknameTaken } from '@/lib/nickname-db';
import { normalizePhone, isValidPhone } from '@/lib/phone';
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
      alimtalkOptIn: false,
      phone: null,
      forecastNotifyOptIn: false,
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
  // alimtalk_opt_in(0017)·phone(0018) 컬럼은 각 마이그레이션 적용 후에만 존재한다.
  // 미적용 환경에서도 닉네임/사진 조회가 깨지지 않도록, 컬럼 없음(42703) 시 기본 컬럼만으로 재조회한다.
  let nickname: string | null = null;
  let image: string | null = null;
  let alimtalkOptIn = false;
  let phone: string | null = null;
  let forecastNotifyOptIn = false;
  const full = await sb
    .from('users')
    .select('nickname, image_url, alimtalk_opt_in, phone, forecast_notify_opt_in')
    .eq('id', userId)
    .maybeSingle();
  if (full.error?.code === '42703') {
    // alimtalk_opt_in(0017)/phone(0018)/forecast_notify_opt_in(0027) 중 일부 미적용 환경.
    // 닉네임/사진만이라도 안전하게 조회되도록 기본 컬럼만으로 재조회한다.
    const fallback = await sb.from('users').select('nickname, image_url').eq('id', userId).maybeSingle();
    nickname = (fallback.data?.nickname as string | null) ?? null;
    image = (fallback.data?.image_url as string | null) ?? null;
  } else {
    nickname = (full.data?.nickname as string | null) ?? null;
    image = (full.data?.image_url as string | null) ?? null;
    alimtalkOptIn = Boolean(full.data?.alimtalk_opt_in);
    phone = (full.data?.phone as string | null) ?? null;
    forecastNotifyOptIn = Boolean(full.data?.forecast_notify_opt_in);
  }
  return NextResponse.json({ nickname, image, alimtalkOptIn, phone, forecastNotifyOptIn });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'db not configured' }, { status: 503 });

  const body = (await req.json()) as {
    nickname?: string;
    resetImage?: boolean;
    alimtalkOptIn?: boolean;
    phone?: string;
    forecastNotifyOptIn?: boolean;
  };

  // 휴대폰번호 저장(본인 스코프). 알림톡 발송·결제 프리필 용도.
  // 빈 문자열은 삭제(null)로 처리, 그 외엔 정규화(숫자만) 후 형식 검증.
  if (typeof body.phone === 'string') {
    const digits = normalizePhone(body.phone);
    const value = digits === '' ? null : digits;
    if (value !== null && !isValidPhone(value)) {
      return NextResponse.json({ error: '휴대폰 번호를 정확히 입력해 주세요.' }, { status: 400 });
    }
    const userId = await getUserId(session.user.email);
    if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });
    const sb = getSupabase();
    const { error } = await sb.from('users').update({ phone: value }).eq('id', userId);
    if (error) {
      // 0018 미적용 환경: 컬럼 없음(42703) → 마이그레이션 안내
      if (error.code === '42703') {
        return NextResponse.json({ error: '휴대폰번호 저장 준비 중이에요. 잠시 후 다시 시도해 주세요.' }, { status: 503 });
      }
      // 개인정보이므로 입력값을 로깅하지 않는다.
      return NextResponse.json({ error: '저장에 실패했어요.' }, { status: 500 });
    }
    return NextResponse.json({ phone: value });
  }

  // 카카오 알림톡 수신 동의 토글(본인 스코프). 발송 연동은 후속이며 여기선 동의 플래그만 저장.
  if (typeof body.alimtalkOptIn === 'boolean') {
    const userId = await getUserId(session.user.email);
    if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });
    const sb = getSupabase();
    const { error } = await sb
      .from('users')
      .update({ alimtalk_opt_in: body.alimtalkOptIn })
      .eq('id', userId);
    if (error) {
      // 0017 미적용 환경: 컬럼 없음(42703) → 마이그레이션 안내
      if (error.code === '42703') {
        return NextResponse.json({ error: '알림톡 설정 준비 중이에요. 잠시 후 다시 시도해 주세요.' }, { status: 503 });
      }
      return NextResponse.json({ error: '변경에 실패했어요.' }, { status: 500 });
    }
    return NextResponse.json({ alimtalkOptIn: body.alimtalkOptIn });
  }

  // 주유 타이밍(가격 인상) 예측 알림 수신 토글(본인 스코프). 발송은 forecast-notify 배치가 담당.
  if (typeof body.forecastNotifyOptIn === 'boolean') {
    const userId = await getUserId(session.user.email);
    if (!userId) return NextResponse.json({ error: 'user not found' }, { status: 404 });
    const sb = getSupabase();
    const { error } = await sb
      .from('users')
      .update({ forecast_notify_opt_in: body.forecastNotifyOptIn })
      .eq('id', userId);
    if (error) {
      // 0027 미적용 환경: 컬럼 없음(42703) → 마이그레이션 안내
      if (error.code === '42703') {
        return NextResponse.json({ error: '알림 설정 준비 중이에요. 잠시 후 다시 시도해 주세요.' }, { status: 503 });
      }
      return NextResponse.json({ error: '변경에 실패했어요.' }, { status: 500 });
    }
    return NextResponse.json({ forecastNotifyOptIn: body.forecastNotifyOptIn });
  }

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
