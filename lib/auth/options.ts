// NextAuth 설정 — App Router용
// 카카오/구글 OAuth, JWT 세션, 첫 로그인 시 Supabase users UPSERT
// + (선택) 심사용 ID/비밀번호 로그인: REVIEWER_EMAIL/PASSWORD env가 모두 설정된 경우에만 활성

import crypto from 'crypto';
import type { NextAuthOptions } from 'next-auth';
import KakaoProvider from 'next-auth/providers/kakao';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getPremiumStatus, getDefaultProduct, getNickname, getAvatar, getSessionId, getSessionIdCached, primeSessionIdCache } from './session';
import { isAdminEmail } from './admin';
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
      // 구글과 동일 취지: 매 로그인 시 계정 선택을 유도해 자동 로그인으로 인한
      // 계정 전환 불가 문제를 완화한다. 카카오 공식 문서가 명시한 표준 값으로,
      // 사용자가 '로그인 정보 저장'을 켠 경우 계정 선택 화면이 노출된다.
      // (재인증 강제 prompt=login은 매번 ID/PW 재입력을 요구해 UX 부담이 커서 미채용)
      authorization: { params: { prompt: 'select_account' } },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      // 매 로그인 시 구글 계정 선택 화면을 강제한다.
      // 앱 로그아웃 후에도 구글 세션은 남아 이전 계정으로 자동 로그인되던 문제 해결
      // (다른 계정 전환/같은 계정 재선택 가능). 구글 전체 로그아웃은 필요 없음.
      authorization: { params: { prompt: 'select_account' } },
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

// 신규 가입자 환영 무료 체험 기간(일). 운영상 쉽게 조정할 수 있게 상수로 분리.
const WELCOME_TRIAL_DAYS = 7;

/**
 * 신규 가입자에게 "1주일 무료 프리미엄(trial)" 1회 부여.
 * - 실결제(PortOne v2)와 무관한 무료 체험: subscriptions에 trial row만 생성한다.
 *   결제/빌링 로직은 일절 건드리지 않는다.
 * - getPremiumStatus는 status∈(trial,active,canceled) & periodEnd(=expires_at||
 *   current_period_end||trial_end) > now 면 isPremium=true → trial_end=now+7일을
 *   넣으면 7일간 프리미엄으로 인정된다.
 * - 1계정 1회: 신규 user insert 분기에서만 호출한다(재로그인엔 호출 안 함). 추가로
 *   이미 trial/active 구독이 있으면(동시 가입/재시도 등) 중복 생성을 방어한다.
 * - best-effort: 어떤 실패도 로그인(가입)을 깨뜨리지 않게 모두 흡수하고 로깅만 한다.
 * - customer_key는 NOT NULL이라 채워야 한다. 무료 체험은 PG 거래가 없으므로
 *   결제 식별자가 없다 → 'welcome_trial:<userId>' 합성값을 넣는다(빌링 흐름과 충돌 없음).
 */
async function grantWelcomeTrial(
  sb: ReturnType<typeof getSupabase>,
  userId: string,
): Promise<void> {
  try {
    // 방어: 이미 유효 구독(trial/active)이 있으면 중복 생성하지 않는다.
    const { data: existingSub } = await sb
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['trial', 'active'])
      .limit(1)
      .maybeSingle();
    if (existingSub) return;

    const now = new Date();
    const nowIso = now.toISOString();
    const trialEnd = new Date(now.getTime() + WELCOME_TRIAL_DAYS * 86400000).toISOString();

    const { error } = await sb.from('subscriptions').insert({
      user_id: userId,
      status: 'trial',
      plan: 'monthly_1000',
      plan_type: 'recurring',
      provider: 'welcome_trial', // 실결제 아님(무료 체험) 표식 — 빌링 provider('portone')와 구분
      customer_key: `welcome_trial:${userId}`, // NOT NULL 충족용 합성값(PG 거래 없음)
      trial_end: trialEnd,
      // periodEnd 폴백 일관성: current_period_end도 trial_end로 맞춰 둔다.
      current_period_start: nowIso,
      current_period_end: trialEnd,
      // 자동 청구 없음(무료 체험만, 빌링키 미발급) → next_charge_at은 비운다.
      next_charge_at: null,
      updated_at: nowIso,
    });
    if (error) {
      // plan_type/expires_at 등 일부 컬럼 미적용 환경(마이그레이션 차이) 방어:
      // 최소 컬럼만으로 1회 재시도. 그래도 실패하면 로깅만 하고 가입은 성공시킨다.
      const retry = await sb.from('subscriptions').insert({
        user_id: userId,
        status: 'trial',
        plan: 'monthly_1000',
        customer_key: `welcome_trial:${userId}`,
        trial_end: trialEnd,
        current_period_end: trialEnd,
        updated_at: nowIso,
      });
      if (retry.error) console.error('[auth] welcome trial 부여 실패', retry.error);
    }
  } catch (e) {
    console.error('[auth] welcome trial 부여 예외', e);
  }
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
        // 신규 user.id를 받아 trial 구독을 연결한다(.select('id').single()).
        const { data: created } = await sb
          .from('users')
          .insert({
            email: user.email,
            name: user.name ?? null,
            nickname,
            image_url: user.image ?? null,
            provider: account?.provider,
            provider_account_id: account?.providerAccountId,
            session_id: sid,
          })
          .select('id')
          .single();
        // 신규 가입 1회 한정 "1주일 무료 프리미엄(trial)" 자동 부여.
        // 실결제(PortOne v2)와 무관한 무료 체험으로, subscriptions에 trial row만 생성한다.
        // best-effort: 부여 실패해도 로그인 자체는 절대 깨지지 않게 try/catch로 격리한다.
        if (created?.id) await grantWelcomeTrial(sb, created.id as string);
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
        const freshSid = await getSessionId(token.userId);
        token.sid = freshSid ?? token.sid;
        token.sessionRevoked = false;
        // 같은 서버 인스턴스에 남아 있던 이전 sid 캐시(=직전 기기 A의 값)를
        // 이번 로그인 sid로 즉시 갱신한다. 이렇게 해야 바로 뒤따르는 검증 재호출이
        // stale 값을 읽지 않는다(아래 fresh 재확인과 합쳐 2중 안전망).
        if (freshSid !== undefined) primeSessionIdCache(token.userId, freshSid);
      }

      // 1계정 1세션 검증 — isPremium(60초) 캐시와 "분리"하여 매 재검증마다 수행한다.
      // 다른 기기에서 더 나중에 로그인하면 DB의 session_id가 바뀌므로, 이 검증이
      // 빠르게 돌수록 기존 기기가 빨리 무효화된다. DB 부하는 경량 캐시(약 3초)로 흡수한다.
      // (getSessionIdCached: email→session_id 단일 컬럼 조회만, isPremium 미조회)
      // 갓 로그인 케이스는 위에서 동기화했으니 제외.
      if (!isFreshLogin && token.userId && token.sid) {
        const cached = await getSessionIdCached(token.userId);
        // cached === undefined: session_id 컬럼 미적용 환경 등 → 검증 불가, 기존 동작 유지.
        // cached !== token.sid 라고 곧장 revoke하면 안 된다(치명 버그):
        //   - 갓 로그인한 현재 기기 B(sid==DB)라도, 같은 인스턴스에 남은 stale 캐시(이전
        //     기기 A의 sid)를 읽으면 cached!==sid가 되어 "유효한 현재 기기"가 오무효화된다.
        // → 캐시값이 불일치할 때만 fresh(uncached) DB 재확인으로 확정한다.
        //   fresh도 token.sid와 다를 때에만 revoke. 같으면 revoke 안 함(B 보호) +
        //   캐시를 fresh 값으로 정정해 다음 호출의 stale 적중을 막는다.
        if (cached !== undefined && cached !== token.sid) {
          const fresh = await getSessionId(token.userId);
          if (fresh !== undefined) primeSessionIdCache(token.userId, fresh);
          if (fresh !== undefined && fresh !== token.sid) {
            // DB 최신 sid가 내 토큰 sid와 다름 = 더 나중에 다른 기기가 로그인함 → 이 기기는 패자.
            token.sessionRevoked = true;
          }
          // fresh === token.sid: 내가 현재 유효 기기 → revoke 안 함(이미 false 유지).
          // fresh === undefined: 검증 불가 → 기존 동작 유지(revoke 안 함).
        }
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
      // 무효화된 세션(중복 로그인으로 밀려난 이전 기기): 로그인 정보를 비워
      // 서버 가드(getSessionUser)가 비로그인으로 보게 하고, 클라이언트엔 revoked 표식을 내린다.
      if (token.sessionRevoked) {
        // 무효화 세션은 관리자 권한도 당연히 없음(isAdmin 주입 안 함 → undefined=false).
        session.revoked = true;
        session.user = { id: undefined, email: null, name: null, image: null };
        return session;
      }
      if (token.userId) session.user.id = token.userId;
      session.user.isPremium = Boolean(token.isPremium);
      session.user.subStatus = token.subStatus ?? 'none';
      session.user.defaultProduct = token.defaultProduct;
      session.user.nickname = token.nickname;
      // 관리자 여부는 서버에서 ADMIN_EMAILS 기반으로 판정해 주입(클라 위변조 불가).
      // 헤더의 "관리자 콘솔" 노출 조건용. 실제 /admin 가드는 서버에서 재검증한다.
      session.user.isAdmin = isAdminEmail(token.email ?? session.user.email);
      // 사용자가 관리하는 프로필 사진을 세션 image에 반영(헤더/마이페이지 표시).
      if (token.picture) session.user.image = token.picture as string;
      return session;
    },
  },
};
