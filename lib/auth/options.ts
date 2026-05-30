// NextAuth 설정 — App Router용
// 카카오/구글 OAuth, JWT 세션, 첫 로그인 시 Supabase users UPSERT

import type { NextAuthOptions } from 'next-auth';
import KakaoProvider from 'next-auth/providers/kakao';
import GoogleProvider from 'next-auth/providers/google';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getPremiumStatus, getDefaultProduct } from './session';

const PREMIUM_CACHE_MS = 60_000;

export const authOptions: NextAuthOptions = {
  providers: [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID ?? '',
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? '',
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],
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
        .select('id')
        .eq('email', user.email)
        .maybeSingle();

      if (!existing) {
        await sb.from('users').insert({
          email: user.email,
          name: user.name ?? null,
          image_url: user.image ?? null,
          provider: account?.provider,
          provider_account_id: account?.providerAccountId,
        });
      } else {
        await sb.from('users').update({
          name: user.name ?? null,
          image_url: user.image ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
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
      }
      return token;
    },

    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId;
      session.user.isPremium = Boolean(token.isPremium);
      session.user.subStatus = token.subStatus ?? 'none';
      session.user.defaultProduct = token.defaultProduct;
      return session;
    },
  },
};
