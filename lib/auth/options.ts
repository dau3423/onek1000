// NextAuth 설정 — App Router용
// 카카오/구글 OAuth, JWT 세션, 첫 로그인 시 Supabase users UPSERT
// + (선택) 심사용 ID/비밀번호 로그인: REVIEWER_EMAIL/PASSWORD env가 모두 설정된 경우에만 활성

import crypto from 'crypto';
import type { NextAuthOptions } from 'next-auth';
import KakaoProvider from 'next-auth/providers/kakao';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getPremiumStatus, getDefaultProduct, getNickname, getAvatar } from './session';
import { generateUniqueNickname } from '@/lib/nickname-db';

const PREMIUM_CACHE_MS = 60_000;

// 심사용 로그인 활성 여부(서버 전용 판단). 두 env가 모두 있어야 활성.
// 클라이언트엔 절대 값을 내리지 않고, 이 boolean만 별도 경로로 전달한다.
export function isReviewerLoginEnabled(): boolean {
  return Boolean(process.env.REVIEWER_EMAIL && process.env.REVIEWER_PASSWORD);
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
    const reviewerEmail = process.env.REVIEWER_EMAIL as string;
    const reviewerPassword = process.env.REVIEWER_PASSWORD as string;
    providers.push(
      CredentialsProvider({
        id: 'credentials',
        name: '심사용 로그인',
        credentials: {
          email: { label: '이메일', type: 'email' },
          password: { label: '비밀번호', type: 'password' },
        },
        async authorize(credentials) {
          const email = credentials?.email ?? '';
          const password = credentials?.password ?? '';
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
        });
      } else {
        const patch: Record<string, unknown> = {
          name: user.name ?? null,
          updated_at: new Date().toISOString(),
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
      if (user?.email) token.email = user.email;
      if (!token.userId && token.email && isSupabaseConfigured()) {
        const sb = getSupabase();
        const { data } = await sb
          .from('users').select('id').eq('email', token.email).maybeSingle();
        if (data) token.userId = data.id;
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
      }
      return token;
    },

    async session({ session, token }) {
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
