// GeoIP 시도 추정 — 서버 전용.
//
// 접속 IP를 한국 시도 코드(SidoCode)로 변환하는 단일 진입점. IP 원본은 저장·로깅하지 않으며,
// 변환 결과(시도 코드)만 recordVisit로 넘긴다(0029 "IP 미저장" 원칙 유지).
//
// [결정적 제약] MAXMIND_LICENSE_KEY·mmdb 파일이 없는 환경(로컬/CI/이 세션)에서도 절대 throw하지
// 않는다. 파일 부재·로드 실패·maxmind 미설치(동적 import 실패)·불량/사설 IP·subdivision 없음 →
// 어떤 경우에도 null을 반환한다. 그래서 /api/visit는 지역 없이도 기존과 동일하게 200을 유지한다.

import type { SidoCode } from '@/types/station';
import { ISO_KR_TO_SIDO } from './sido-map';

// mmdb 경로: env(GEOIP_DB_PATH) 우선, 없으면 기본 경로(운영 다운로드 스크립트가 내려받는 위치).
const DB_PATH = process.env.GEOIP_DB_PATH || 'data/geoip/GeoLite2-City.mmdb';

// maxmind Reader의 최소 형태(패키지 미설치/타입 변동에도 결합을 낮추기 위해 느슨하게 선언).
type LooseReader = { get: (ip: string) => unknown };

// GeoLite2-City 응답 중 우리가 쓰는 필드만.
type GeoResult = {
  country?: { iso_code?: string } | null;
  subdivisions?: Array<{ iso_code?: string } | null> | null;
} | null;

// lazy 싱글턴: 첫 조회 시 1회만 로드 시도. 결과(성공 Reader 또는 null)를 캐시해 재시도 폭주를 막는다.
let readerPromise: Promise<LooseReader | null> | null = null;

async function getReader(): Promise<LooseReader | null> {
  if (readerPromise) return readerPromise;
  readerPromise = (async () => {
    try {
      // 동적 import: maxmind 미설치 환경에서도 런타임에 안전(실패 시 null).
      const mod = await import('maxmind').catch(() => null);
      if (!mod) return null;
      const open =
        (mod as { open?: (p: string) => Promise<LooseReader> }).open ??
        (mod as { default?: { open?: (p: string) => Promise<LooseReader> } }).default?.open;
      if (typeof open !== 'function') return null;
      return await open(DB_PATH);
    } catch {
      // mmdb 파일 부재·로드 실패 → null(throw 금지). 이후 조회는 캐시된 null로 즉시 통과.
      return null;
    }
  })();
  return readerPromise;
}

// 사설/루프백/링크로컬/불량 IPv4는 조회 의미가 없어 미리 컷(maxmind도 못 찾음). IPv6는 리더에 위임.
function isPrivateOrInvalid(ip: string): boolean {
  if (ip === '::1' || ip === '0.0.0.0') return true;
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false; // IPv4 형식 아님 → IPv6 등, 리더에 위임(완전 불량은 get에서 걸러짐)
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * IP → 시도 코드. 어떤 입력·환경에서도 throw하지 않고, 추정 불가 시 null.
 * IP 원본은 이 함수 밖으로 나가지 않으며 어디에도 저장·로깅하지 않는다.
 */
export async function lookupSido(ip: string): Promise<SidoCode | null> {
  try {
    if (!ip || ip === 'unknown') return null;
    if (isPrivateOrInvalid(ip)) return null;
    const reader = await getReader();
    if (!reader) return null;
    const res = reader.get(ip) as GeoResult;
    if (!res) return null;
    // 한국 밖 IP는 시도 매핑 대상이 아니다.
    if (res.country?.iso_code && res.country.iso_code !== 'KR') return null;
    const iso = res.subdivisions?.[0]?.iso_code;
    if (!iso) return null;
    return ISO_KR_TO_SIDO[`KR-${iso.toUpperCase()}`] ?? null;
  } catch {
    return null;
  }
}
