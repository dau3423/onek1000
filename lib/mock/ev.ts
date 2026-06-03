// 전기차 충전소 Mock 데이터
// NEXT_PUBLIC_USE_MOCK=true 또는 Supabase 미설정 시 폴백. 주유소 mock(lib/mock/stations.ts)과 동일 역할.

import type { EvChargerUnit, EvStationDetail, EvStationMarker } from '@/types/ev';
import { chargerSpeed } from '@/types/ev';
import { distanceMeters } from '@/lib/map/geo';
import type { Bbox } from '@/lib/map/geo';
import { inBbox } from '@/lib/map/geo';

interface SeedCharger {
  chgerId: string;
  chgerType: string;
  output: number;
  stat: string;          // 0~5
  /** 마지막 상태 갱신으로부터 경과 분(now - X분). 데모용 "최근 갱신 X 전" 표시. */
  updMinAgo: number;
}

interface SeedStation {
  statId: string;
  name: string;
  lat: number;
  lng: number;
  busiNm: string;
  busiCall: string;
  address: string;
  useTime: string;
  parkingFree: boolean;
  chargers: SeedCharger[];
}

const SEED: SeedStation[] = [
  {
    statId: 'EV000001', name: '강남구청 공영주차장', lat: 37.5172, lng: 127.0473,
    busiNm: '환경부', busiCall: '1661-9408', address: '서울 강남구 학동로 426',
    useTime: '24시간 이용가능', parkingFree: true,
    chargers: [
      { chgerId: '01', chgerType: '04', output: 100, stat: '2', updMinAgo: 12 },
      { chgerId: '02', chgerType: '04', output: 100, stat: '3', updMinAgo: 5 },
      { chgerId: '03', chgerType: '02', output: 7, stat: '2', updMinAgo: 40 },
    ],
  },
  {
    statId: 'EV000002', name: '역삼 e편한세상', lat: 37.5004, lng: 127.0367,
    busiNm: '한국전기차충전서비스', busiCall: '1600-1234', address: '서울 강남구 역삼로 180',
    useTime: '06:00~24:00', parkingFree: false,
    chargers: [
      { chgerId: '01', chgerType: '02', output: 7, stat: '2', updMinAgo: 90 },
      { chgerId: '02', chgerType: '02', output: 7, stat: '4', updMinAgo: 200 },
    ],
  },
  {
    statId: 'EV000003', name: '잠실종합운동장', lat: 37.5117, lng: 127.0735,
    busiNm: '대영채비', busiCall: '1666-4334', address: '서울 송파구 올림픽로 25',
    useTime: '24시간 이용가능', parkingFree: true,
    chargers: [
      { chgerId: '01', chgerType: '06', output: 200, stat: '2', updMinAgo: 3 },
      { chgerId: '02', chgerType: '06', output: 200, stat: '5', updMinAgo: 1500 },
    ],
  },
  {
    statId: 'EV000004', name: '판교테크노밸리 공영', lat: 37.4012, lng: 127.1086,
    busiNm: 'GS커넥트', busiCall: '1522-3133', address: '경기 성남시 분당구 판교역로 152',
    useTime: '24시간 이용가능', parkingFree: false,
    chargers: [
      { chgerId: '01', chgerType: '10', output: 350, stat: '2', updMinAgo: 8 },
      { chgerId: '02', chgerType: '04', output: 100, stat: '2', updMinAgo: 22 },
      { chgerId: '03', chgerType: '02', output: 11, stat: '3', updMinAgo: 15 },
    ],
  },
  {
    statId: 'EV000005', name: '인천공항 제1터미널', lat: 37.4490, lng: 126.4505,
    busiNm: '환경부', busiCall: '1661-9408', address: '인천 중구 공항로 272',
    useTime: '24시간 이용가능', parkingFree: false,
    chargers: [
      { chgerId: '01', chgerType: '04', output: 100, stat: '1', updMinAgo: 600 },
      { chgerId: '02', chgerType: '04', output: 100, stat: '2', updMinAgo: 30 },
    ],
  },
  {
    statId: 'EV000006', name: '해운대 센텀시티', lat: 35.1689, lng: 129.1314,
    busiNm: '차지비(ChargEV)', busiCall: '1661-1230', address: '부산 해운대구 센텀남대로 35',
    useTime: '24시간 이용가능', parkingFree: true,
    chargers: [
      { chgerId: '01', chgerType: '06', output: 200, stat: '2', updMinAgo: 18 },
      { chgerId: '02', chgerType: '02', output: 7, stat: '2', updMinAgo: 70 },
    ],
  },
];

function unitsFromSeed(s: SeedStation): EvChargerUnit[] {
  const now = Date.now();
  return s.chargers.map((c) => ({
    statId: s.statId,
    chgerId: c.chgerId,
    chgerType: c.chgerType,
    output: c.output,
    stat: c.stat,
    statUpdAt: new Date(now - c.updMinAgo * 60_000).toISOString(),
  }));
}

function markerFromSeed(s: SeedStation): EvStationMarker {
  const units = unitsFromSeed(s);
  const outputs = units.map((u) => u.output).filter((o): o is number => o != null);
  const updTimes = units.map((u) => u.statUpdAt).filter((t): t is string => !!t).sort();
  const now = new Date().toISOString();
  return {
    statId: s.statId,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    busiNm: s.busiNm,
    totalChargers: units.length,
    availableChargers: units.filter((u) => u.stat === '2').length,
    hasFast: units.some((u) => chargerSpeed(u.chgerType, u.output) === 'fast'),
    hasSlow: units.some((u) => chargerSpeed(u.chgerType, u.output) === 'slow'),
    maxOutput: outputs.length ? Math.max(...outputs) : null,
    latestStatUpdAt: updTimes.length ? updTimes[updTimes.length - 1] : null,
    syncedAt: now,
  };
}

/** bbox 내 mock 충전소 마커 (RPC와 동일 동작 재현) */
export function getMockEvChargersByBbox(bbox: Bbox, limit: number): EvStationMarker[] {
  return SEED.map(markerFromSeed)
    .filter((m) => inBbox(m.lat, m.lng, bbox))
    .sort((a, b) => b.availableChargers - a.availableChargers || b.totalChargers - a.totalChargers)
    .slice(0, limit);
}

/** 반경 내 mock 충전소 마커 (거리 오름차순) — 내 주변 표시용 폴백 */
export function getMockEvChargersByRadius(lat: number, lng: number, radiusM: number, limit: number): EvStationMarker[] {
  return SEED.map(markerFromSeed)
    .map((m) => ({ m, d: distanceMeters(lat, lng, m.lat, m.lng) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.m);
}

/** statId로 mock 충전소 상세 */
export function getMockEvStationDetail(statId: string): EvStationDetail | null {
  const s = SEED.find((x) => x.statId === statId);
  if (!s) return null;
  const marker = markerFromSeed(s);
  return {
    ...marker,
    address: s.address,
    busiCall: s.busiCall,
    useTime: s.useTime,
    parkingFree: s.parkingFree,
    chargers: unitsFromSeed(s),
  };
}
