// next-auth 세션/JWT 타입 확장
import 'next-auth';
import 'next-auth/jwt';
import type { ProductCode } from './station';

declare module 'next-auth' {
  interface Session {
    /**
     * 중복 로그인으로 무효화된 세션 표식(1계정 1세션, last-login-wins).
     * 다른 기기에서 더 나중에 로그인하면 이 세션의 토큰 sid가 DB와 어긋나 true가 되며,
     * 클라이언트는 이를 보고 강제 로그아웃한다. 서버에서는 user.id/email이 비워진다.
     */
    revoked?: boolean;
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      isPremium?: boolean;
      subStatus?: 'trial' | 'active' | 'canceled' | 'expired' | 'past_due' | 'none';
      /** 기본 차량 유종 — 지도/필터 자동 선택용(없으면 undefined → B027 유지) */
      defaultProduct?: ProductCode;
      /** 표시용 닉네임(첫 로그인 시 자동 생성, /my에서 변경) */
      nickname?: string;
      /**
       * 관리자 여부 — 서버(session 콜백)에서 isAdminEmail(email)로 판정해 주입.
       * 클라이언트(헤더 등)에서 "관리자 콘솔" 노출 조건으로만 쓰며, 위변조 불가
       * (세션 토큰 기반 서버 판정값). 실제 /admin 접근 가드는 서버에서 재검증한다.
       */
      isAdmin?: boolean;
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
    /** 닉네임(캐시) */
    nickname?: string;
    /** 이 토큰이 발급된 로그인 세션 식별자(1계정 1세션 검증용). 로그인 시 새로 발급. */
    sid?: string;
    /** 중복 로그인으로 이 세션이 무효화됨(DB의 최신 sid와 불일치). */
    sessionRevoked?: boolean;
  }
}
