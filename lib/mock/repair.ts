// 자동차 정비소 Mock 데이터
// NEXT_PUBLIC_USE_MOCK=true 또는 Supabase 미설정 시 폴백. 세차장 mock(lib/mock/carwash.ts)과 동일 역할.
// 원천 데이터의 특성을 그대로 반영한다 — 전화번호 채움률 약 51%, 영업시간 약 38% 라
// 일부러 비어 있는 항목을 섞어 "없는 경우" UI 를 mock 에서도 보게 한다.

import type { RepairDetail, RepairMarker } from '@/types/repair';
import type { Bbox } from '@/lib/map/geo';
import { inBbox } from '@/lib/map/geo';

const now = () => new Date().toISOString();

const SEED: Omit<RepairMarker, 'syncedAt'>[] = [
  {
    shopKey: 'RP-MOCK-0001', name: '강남종합자동차정비', shopType: 'general',
    roadAddr: '서울 강남구 논현로 508', jibunAddr: '서울 강남구 역삼동 707',
    tel: '02-555-1234', openTime: '09:00', closeTime: '18:00',
    lat: 37.5045, lng: 127.0250, dataBaseDate: '2026-02-28',
  },
  {
    shopKey: 'RP-MOCK-0002', name: '삼성카센터', shopType: 'specialty',
    roadAddr: '서울 강남구 테헤란로 152', jibunAddr: '서울 강남구 역삼동 737',
    // 전화번호·영업시간 없음 — 원천에서 흔한 경우(채움률 51%/38%)
    tel: null, openTime: null, closeTime: null,
    lat: 37.5000, lng: 127.0364, dataBaseDate: '2026-02-28',
  },
  {
    shopKey: 'RP-MOCK-0003', name: '한신소형자동차정비', shopType: 'small',
    roadAddr: '서울 서초구 반포대로 58', jibunAddr: '서울 서초구 서초동 1305',
    tel: '02-777-8888', openTime: '08:30', closeTime: '19:00',
    lat: 37.4934, lng: 127.0141, dataBaseDate: '2025-08-31',
  },
  {
    shopKey: 'RP-MOCK-0004', name: '대영원동기정비', shopType: 'engine',
    roadAddr: '서울 송파구 백제고분로 271', jibunAddr: null,
    tel: null, openTime: '09:00', closeTime: '18:00',
    lat: 37.5045, lng: 127.1120, dataBaseDate: '2025-08-31',
  },
  {
    shopKey: 'RP-MOCK-0005', name: '우리모터스', shopType: 'unknown',
    roadAddr: '서울 마포구 양화로 45', jibunAddr: '서울 마포구 서교동 375',
    tel: '02-333-2222', openTime: null, closeTime: null,
    lat: 37.5533, lng: 126.9180, dataBaseDate: '2026-02-28',
  },
];

export function getMockRepairByBbox(bbox: Bbox, limit: number): RepairMarker[] {
  return SEED
    .filter((s) => inBbox(s.lat, s.lng, bbox))
    .slice(0, limit)
    .map((s) => ({ ...s, syncedAt: now() }));
}

export function getMockRepairDetail(shopKey: string): RepairDetail | null {
  const found = SEED.find((s) => s.shopKey === shopKey);
  if (!found) return null;
  return { ...found, syncedAt: now(), institution: '강남구청', area: '120' };
}
