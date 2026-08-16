// 독립 세차장 Mock 데이터
// NEXT_PUBLIC_USE_MOCK=true 또는 Supabase 미설정 시 폴백. EV mock(lib/mock/ev.ts)과 동일 역할.
// 서울 도심 좌표 위주로 유형을 섞어(self/hand/auto/unknown) 유형 필터/뱃지 동작을 데모한다.

import type { CarwashDetail, CarwashMarker } from '@/types/carwash';
import type { Bbox } from '@/lib/map/geo';
import { inBbox } from '@/lib/map/geo';

const now = () => new Date().toISOString();

const SEED: Omit<CarwashMarker, 'syncedAt'>[] = [
  {
    mgmtNo: 'CW-MOCK-0001', name: '스마트 셀프카워시 강남', washType: 'self',
    roadAddr: '서울 강남구 봉은사로 213', jibunAddr: '서울 강남구 논현동 71',
    tel: '02-123-4567', weekdayOpen: '07:00', weekdayClose: '23:00',
    feeInfo: '셀프 5,000원~', closedDay: null,
    lat: 37.5104, lng: 127.0330, dataBaseDate: '2025-11-27',
  },
  {
    mgmtNo: 'CW-MOCK-0002', name: '프리미엄 손세차 디테일링', washType: 'hand',
    roadAddr: '서울 서초구 강남대로 373', jibunAddr: null,
    tel: '02-234-5678', weekdayOpen: null, weekdayClose: null,
    feeInfo: null, closedDay: '일요일',
    lat: 37.4979, lng: 127.0276, dataBaseDate: '2025-10-15',
  },
  {
    mgmtNo: 'CW-MOCK-0003', name: '오토워시 자동세차 역삼점', washType: 'auto',
    roadAddr: '서울 강남구 역삼로 180', jibunAddr: '서울 강남구 역삼동 720',
    tel: null, weekdayOpen: '24시간', weekdayClose: null,
    feeInfo: '자동 8,000원', closedDay: null,
    lat: 37.5006, lng: 127.0369, dataBaseDate: '2024-06-01',
  },
  {
    mgmtNo: 'CW-MOCK-0004', name: '동네세차장', washType: 'unknown',
    roadAddr: null, jibunAddr: '서울 마포구 서교동 356',
    tel: null, weekdayOpen: null, weekdayClose: null,
    feeInfo: null, closedDay: null,
    lat: 37.5545, lng: 126.9226, dataBaseDate: null,
  },
  {
    mgmtNo: 'CW-MOCK-0005', name: '셀프워시 홍대', washType: 'self',
    roadAddr: '서울 마포구 양화로 100', jibunAddr: null,
    tel: '02-345-6789', weekdayOpen: '06:00', weekdayClose: '24:00',
    feeInfo: null, closedDay: null,
    lat: 37.5561, lng: 126.9237, dataBaseDate: '2025-09-30',
  },
  {
    mgmtNo: 'CW-MOCK-0006', name: '손세차 프로 종로', washType: 'hand',
    roadAddr: '서울 종로구 종로 100', jibunAddr: '서울 종로구 종로2가 6',
    tel: '02-456-7890', weekdayOpen: '08:00', weekdayClose: '20:00',
    feeInfo: '기본 30,000원~', closedDay: '토·일',
    lat: 37.5701, lng: 126.9910, dataBaseDate: '2025-11-01',
  },
];

/** bbox 내 mock 세차장 마커 (RPC와 동일 동작 재현) */
export function getMockCarwashByBbox(bbox: Bbox, limit: number): CarwashMarker[] {
  const ts = now();
  return SEED
    .filter((s) => inBbox(s.lat, s.lng, bbox))
    .slice(0, limit)
    .map((s) => ({ ...s, syncedAt: ts }));
}

/** mgmt_no로 mock 세차장 상세 (queryCarwashDetail와 동일 동작 재현). 없으면 null. */
export function getMockCarwashDetail(mgmtNo: string): CarwashDetail | null {
  const seed = SEED.find((s) => s.mgmtNo === mgmtNo);
  if (!seed) return null;
  // SEED엔 휴일 운영시간 컬럼이 없으므로 상세에서도 null(있을 때만 노출 원칙과 일치).
  return { ...seed, holidayOpen: null, holidayClose: null, syncedAt: now() };
}
