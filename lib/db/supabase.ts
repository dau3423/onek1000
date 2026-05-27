// Supabase 클라이언트 — 서버 사이드 전용 (service_role)
// 클라이언트(브라우저)에서는 NEXT_PUBLIC_SUPABASE_ANON_KEY를 사용해야 하지만
// 우리 앱은 모든 DB 접근을 API Routes로 거치므로 서버 전용 패턴 유지.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _server: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_server) return _server;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  _server = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'onek-server' } },
  });
  return _server;
}

/** 환경변수가 있을 때만 true. 알파 단계 전에는 mock으로 폴백. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
