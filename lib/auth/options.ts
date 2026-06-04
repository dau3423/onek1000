// NextAuth 설정 — App Router용
// 카카오/구글 OAuth, JWT 세션, 첫 로그인 시 Supabase users UPSERT
// + (선택) 심사용 ID/비밀번호 로그인: REVIEWER_EMAIL/PASSWORD env가 모두 설정된 경우에만 활성

import crypto from 'crypto';
import type { NextAuthOptions } from 'next-auth';
import KakaoProvider from 'next-auth/providers/kakao';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getPremiumStatus, getDefaultProduct, getNickname, getAvatar, getSessionId } from './session';
import { generateUniqueNickname } from '@/lib/nickname-db';

const PREMIUM_CACHE_MS = 60_000;

// 심사 계정 정규화 헬퍼.
// secret(env)에 줄바꿈/공백이 섞이거나, 모바일 키보드가 이메일 첫 글자를 자동
// 대문자로 바꾸는 경우에도 매칭이 깨지지 않도록 입력/secret 양쪽을 동일하게 정규화한다.
//  - normPassword: trim만(비밀번호 대소문자는 보존). secret 끝 공백/줄바꿈 대비.
//  - normEmail: trim + 소문자화(이메일은 본래 대소문자 구분 없음 → 모바일 자동 대문자 대비).
function normPassword(v: string | undefined | null): string {
  return (v ?? '').trim();
}
function normEmail(v: string | undefined | null): string {
  return (v ?? '').trim().toLowerCase();
}

// 심사용 로그인 활성 여부(서버 전용 판단). 두 env가 모두 있어야 활성.
// trim 후 truthy 판정(공백/줄바꿈만 든 secret은 미설정으로 취급).
// 클라이언트엔 절대 값을 내리지 않고, 이 boolean만 별도 경로로 전달한다.
export function isReviewerLoginEnabled(): boolean {
  return Boolean(normEmail(process.env.REVIEWER_EMAIL) && normPassword(process.env.REVIEWER_PASSWORD));
}

// 타이밍 안전 문자열 비교(길이 노출 방지를 위해 양쪽을 SHA-256 후 고정 길이로 비교)
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function buildProviders(): NextAuthOptions['providers'] {
  const providers: NextAuthOptions['providers'] = [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID ?? '',
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? '',
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ];

  // 심사용 단일 계정 로그인: env가 모두 설정된 경우에만 providers에 추가.
  // 미설정이면 provider 자체가 없어 일반 사용자에게 노출/위험이 없다.
  if (isReviewerLoginEnabled()) {
    // secret도 입력과 동일하게 정규화해 둔다(끝 공백/줄바꿈, 이메일 대문자 대비).
    const reviewerEmail = normEmail(process.env.REVIEWER_EMAIL);
    const reviewerPassword = normPassword(process.env.REVIEWER_PASSWORD);
    providers.push(
      CredentialsProvider({
        id: 'credentials',
        name: '심사용 로그인',
        credentials: {
          email: { label: '이메일', type: 'email' },
          password: { label: '비밀번호', type: 'password' },
        },
        async authorize(credentials) {
          // 입력값도 secret과 동일 규칙으로 정규화 후 비교한다.
          const email = normEmail(credentials?.email);
          const password = normPassword(credentials?.password);
          // env 단일 심사 계정과 정확히 일치할 때만 허용(타이밍 안전 비교).
          if (!email || !password) return null;
          if (!safeEqual(email, reviewerEmail)) return null;
          if (!safeEqual(password, reviewerPassword)) return null;
          // email을 반드시 채워 signIn 콜백의 users UPSERT가 정상 동작하게 한다.
          return { id: reviewerEmail, email: reviewerEmail, name: '심사 계정' };
        },
      })
    );
  }

  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: buildProviders(),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/sign-in',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false; // 이메일 미동의 시 차단
      if (!isSupabaseConfigured()) return true; // 개발 환경 — DB 없어도 로그인 자체는 허용

      const sb = getSupabase();
      const { data: existing } = await sb
        .from('users')
        .select('id, nickname, image_url')
        .eq('email', user.email)
        .maybeSingle();

      // 1계정 1세션(last-login-wins): 이번 로그인의 세션 식별자를 새로 발급해 DB에 기록한다.
      // 기존 기기에 남아 있던 토큰의 sid는 더 이상 DB와 일치하지 않게 되어 무효화된다.
      const sid = crypto.randomUUID();

      if (!existing) {
        // 첫 로그인: 유니크한 한국어 닉네임 자동 생성
        const nickname = await generateUniqueNickname();
        await sb.from('users').insert({
          email: user.email,
          name: user.name ?? null,
          nickname,
          image_url: user.image ?? null,
          provider: account?.provider,
          provider_account_id: account?.providerAccountId,
          session_id: sid,
        });
      } else {
        const patch: Record<string, unknown> = {
          name: user.name ?? null,
          updated_at: new Date().toISOString(),
          // 새 세션 식별자로 교체 → 이전 기기 세션은 다음 검증 때 무효 처리된다.
          session_id: sid,
        };
        // 기존 사용자(닉네임 없는 레코드) 자동 백필
        if (!existing.nickname) patch.nickname = await generateUniqueNickname();
        // 프로필 사진(image_url)은 사용자가 직접 관리하므로 매 로그인마다 소셜
        // 이미지로 덮어쓰지 않는다. 단, 비어 있으면 소셜 이미지로 1회 백필.
        if (!existing.image_url && user.image) patch.image_url = user.image;
        await sb.from('users').update(patch).eq('id', existing.id);
      }
      return true;
    },

    async jwt({ token, user, trigger }) {
      const isFreshLogin = Boolean(user?.email);
      if (user?.email) token.email = user.email;
      if (!token.userId && token.email && isSupabaseConfigured()) {
        const sb = getSupabase();
        const { data } = await sb
          .from('users').select('id').eq('email', token.email).maybeSingle();
        if (data) token.userId = data.id;
      }

      // 1계정 1세션: 갓 로그인한 토큰(이번 signIn에서 새 sid를 DB에 기록한 승자)에는
      // DB의 최신 session_id를 그대로 박는다. 이후 검증에서 자기 자신과 일치하게 된다.
      if (isFreshLogin && token.userId) {
        token.sid = (await getSessionId(token.userId)) ?? token.sid;
        token.sessionRevoked = false;
      }

      // isPremium 캐시 (60초 또는 명시적 update trigger 시 갱신)
      const now = Date.now();
      const stale = !token.premiumCheckedAt || now - token.premiumCheckedAt > PREMIUM_CACHE_MS;
      if (trigger === 'update' || stale) {
        const status = await getPremiumStatus(token.userId);
        token.isPremium = status.isPremium;
        token.subStatus = status.status;
        token.premiumCheckedAt = now;
        // 기본 차량 유종도 같은 캐시 주기로 갱신(없으면 undefined → 클라이언트 B027 유지)
        token.defaultProduct = (await getDefaultProduct(token.userId)) ?? undefined;
        // 닉네임도 같은 주기로 갱신(변경 시 update() 트리거로 즉시 반영)
        token.nickname = (await getNickname(token.userId)) ?? undefined;
        // 프로필 사진(사용자 관리 image_url)도 같은 주기로 갱신.
        // DB값이 있으면 우선, 없으면 소셜 이미지 폴백.
        token.picture = (await getAvatar(token.userId)) ?? token.picture ?? undefined;

        // 1계정 1세션 검증: DB 최신 sid와 토큰 sid가 다르면(= 다른 기기에서 더 나중에
        // 로그인) 이 세션을 무효로 표시한다. 갓 로그인 케이스는 위에서 동기화했으니 제외.
        // DB 조회는 프리미엄 캐시와 같은 60초 주기에 묶어 추가 부담을 최소화한다.
        if (!isFreshLogin && token.userId && token.sid) {
          const current = await getSessionId(token.userId);
          // current === undefined: session_id 컬럼 미적용 환경 등 → 검증 불가, 기존 동작 유지.
          if (current && current !== token.sid) token.sessionRevoked = true;
        }
      }
      return token;
    },

    async session({ session, token }) {
      // 무효화된 세션(중복 로그인으로 밀려난 이전 기기): 로그인 정보를 비워
      // 서버 가드(getSessionUser)가 비로그인으로 보게 하고, 클라이언트엔 revoked 표식을 내린다.
      if (token.sessionRevoked) {
        session.revoked = true;
        session.user = { id: undefined, email: null, name: null, image: null };
        return session;
      }
      if (token.userId) session.user.id = token.userId;
      session.user.isPremium = Boolean(token.isPremium);
      session.user.subStatus = token.subStatus ?? 'none';
      session.user.defaultProduct = token.defaultProduct;
      session.user.nickname = token.nickname;
      // 사용자가 관리하는 프로필 사진을 세션 image에 반영(헤더/마이페이지 표시).
      if (token.picture) session.user.image = token.picture as string;
      return session;
    },
  },
};
