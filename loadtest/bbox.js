// k6 부하 테스트 — bbox API
//   k6 run loadtest/bbox.js
// 시나리오: 30초 ramp-up → 1분 유지 → 30초 ramp-down. 목표 200rps.
// 캐시 적중률 확인용으로 좌표는 양자화 격자 안에서 고정.

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m',  target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<300', 'p(99)<800'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

// 서울 강남 일대 bbox 5종 (사용자 패닝을 흉내)
const BBOXES = [
  { swLat: 37.488, swLng: 127.020, neLat: 37.515, neLng: 127.060 },
  { swLat: 37.495, swLng: 127.005, neLat: 37.522, neLng: 127.045 },
  { swLat: 37.500, swLng: 127.025, neLat: 37.527, neLng: 127.065 },
  { swLat: 37.520, swLng: 126.975, neLat: 37.580, neLng: 127.050 }, // 종로/광화문
  { swLat: 35.140, swLng: 129.050, neLat: 35.170, neLng: 129.100 }, // 부산
];

const PRODUCTS = ['B027', 'D047'];

export default function () {
  const b = BBOXES[Math.floor(Math.random() * BBOXES.length)];
  const p = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
  const url = `${BASE}/api/stations/bbox?swLat=${b.swLat}&swLng=${b.swLng}&neLat=${b.neLat}&neLng=${b.neLng}&zoom=12&product=${p}`;
  const res = http.get(url);
  check(res, {
    'status 200':       (r) => r.status === 200,
    'has stations':     (r) => Array.isArray(r.json('stations')),
    'cached or fresh':  (r) => ['HIT', 'MISS'].includes(r.headers['X-Cache'] || ''),
  });
  sleep(0.2);
}
