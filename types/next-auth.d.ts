// next-auth 세션/JWT 타입 확장
import 'next-auth';
import 'next-auth/jwt';
import type { ProductCode } from './station';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      isPremium?: boolean;
      subStatus?: 'trial' | 'active' | 'canceled' | 'expired' | 'past_due' | 'none';
      /** 기본 차량 유종 — 지도/필터 자동 선택용(없으면 undefined → B027 유지) */
      defaultProduct?: ProductCode;
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
    /** 기본 차량 유종(캐시) */
    defaultProduct?: ProductCode;
  }
}
