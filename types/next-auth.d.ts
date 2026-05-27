// next-auth 세션/JWT 타입 확장
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      isPremium?: boolean;
      subStatus?: 'trial' | 'active' | 'canceled' | 'expired' | 'past_due' | 'none';
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    email?: string;
    isPremium?: boolean;
    subStatus?: 'trial' | 'active' | 'canceled' | 'expired' | 'past_due' | 'none';
    /** isPremium 마지막 조회 시각(ms) — 60초 캐시 */
    premiumCheckedAt?: number;
  }
}
