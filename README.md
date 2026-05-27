# 1000냥 주유소

전국 주유소 실시간 가격을 지도에서 확인하고, GPS 1km 반경 최저가를 알려주는 웹 서비스.
무료(광고 포함) / 월 ₩1,000 구독(광고 제거 + 가격 변동 푸시) 프리미엄 모델.

> 📚 설계 문서는 [`docs/`](./docs/README.md) 참고.

---

## 빠른 시작 (Local Dev — Mock 모드)

```bash
npm install
cp .env.example .env.local
# .env.local에 NEXT_PUBLIC_KAKAO_MAP_KEY만 입력
npm run dev
```

→ http://localhost:3000

`NEXT_PUBLIC_USE_MOCK=true` 기본값으로 전국 60여 개 mock 주유소가 표시됩니다.

### 카카오맵 JS 키 발급
1. [카카오 디벨로퍼스](https://developers.kakao.com) → 애플리케이션 추가
2. **앱 설정 > 플랫폼 > Web** 에 `http://localhost:3000` 추가
3. **JavaScript 키** 복사 → `.env.local` `NEXT_PUBLIC_KAKAO_MAP_KEY`

---

## 알파/베타 활성화

### 1. Supabase
```bash
# https://supabase.com → New project → SQL Editor에서 순서대로 실행:
supabase/migrations/0001_init.sql                  # 기본 스키마
supabase/migrations/0002_lat_lng_and_search.sql    # lat/lng, 검색, 푸시, 경로 RPC
supabase/migrations/0003_history_rpc.sql           # 가격 이력 RPC

# Project Settings → API 에서 URL / service_role 키 복사
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 2. Opinet 인증키
[오피넷 무료 API 신청](https://www.opinet.co.kr/user/custapi/custApiNew.do) 후 `OPINET_API_KEY`.

### 3. Upstash Redis (선택, 권장)
[Upstash](https://upstash.com) → Redis DB → REST URL/Token 복사.

### 4. NextAuth (카카오/구글)
```bash
openssl rand -base64 32   # NEXTAUTH_SECRET

# Redirect URI:
#   http://localhost:3000/api/auth/callback/kakao
#   http://localhost:3000/api/auth/callback/google
```

### 5. 토스페이먼츠
[토스 개발자센터](https://developers.tosspayments.com) → TEST 키부터.

### 6. Web Push (베타 — 즐겨찾기 가격 변동 알림)
```bash
# VAPID 키 1회 발급
npm run vapid:gen
# 출력된 두 줄을 .env.local에 그대로 복사
```

### 7. AdSense (선택, 출시 후)
승인 후 게시자 ID + 슬롯 입력. 미설정 시 자체 CTA로 폴백.

### 8. Cron (Vercel)
`vercel.json` 등록 완료:
- `/api/internal/sync-opinet` — 매시 5분 (Opinet 동기화 + 푸시 발송)
- `/api/billing/charge-cron` — 매시 10분 (정기결제)

로컬 테스트:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/internal/sync-opinet
```

---

## 폴더 구조

```
.
├─ app/
│  ├─ page.tsx                       # 메인 지도
│  ├─ station/[id]/                  # 상세 + 30일 가격 차트
│  ├─ pricing/                       # 구독 안내 + Subscribe
│  ├─ my/                            # 마이페이지 + 즐겨찾기 + 푸시 토글
│  ├─ search/                        # 주유소 검색
│  ├─ route/                         # 경로별 최저가
│  ├─ auth/sign-in/
│  ├─ billing/{success,fail}/
│  └─ api/
│     ├─ stations/{bbox,radius,[id]}/
│     ├─ stations/[id]/history/      # 가격 이력
│     ├─ avg-price/
│     ├─ search/                     # 주유소 검색
│     ├─ route-cheapest/             # 경로 위 최저가
│     ├─ auth/[...nextauth]/
│     ├─ billing/{subscribe,cancel,webhook,charge-cron}/
│     ├─ favorites/
│     ├─ push/{vapid,subscribe}/
│     └─ internal/sync-opinet/
├─ components/
│  ├─ map/, ui/, alert/, ads/, billing/, charts/, push/
│  ├─ FavoriteButton.tsx
│  ├─ SessionProvider.tsx
│  └─ SignOutButton.tsx
├─ lib/
│  ├─ opinet/client.ts
│  ├─ mock/stations.ts
│  ├─ db/{supabase,queries}.ts
│  ├─ cache/redis.ts
│  ├─ auth/{options,session}.ts
│  ├─ billing/toss.ts
│  ├─ push/webpush.ts
│  └─ map/geo.ts
├─ hooks/useGeolocation.ts
├─ stores/map.ts
├─ types/{station,kakao,next-auth}.d.ts
├─ supabase/migrations/0001~0003.sql
├─ public/{sw.js, favicon.svg, manifest.json}
├─ loadtest/bbox.js                  # k6 부하 테스트
├─ vercel.json
└─ docs/
```

## 명령어

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | TypeScript 검사 |
| `npm run lint` | ESLint |
| `npm run vapid:gen` | VAPID 키 발급 (1회) |
| `k6 run loadtest/bbox.js` | bbox API 부하 테스트 |

## 베타 체크리스트

- [x] `stations.lat/lng` 컬럼 분리 + sync-opinet 반영
- [x] NextAuth 세션에 `isPremium`/`subStatus` 주입 (60초 캐시)
- [x] 가격 이력 API + Recharts 30일 차트 (상세 페이지)
- [x] 주유소 검색 (pg_trgm 인덱스) + 헤더 검색 버튼
- [x] 경로별 최저가 (직선 buffer 2km, PostGIS RPC)
- [x] FCM/Web Push (VAPID) + Service Worker
- [x] 즐겨찾기 가격 변동 감지 → 프리미엄 사용자 푸시 (Cron 내장)
- [x] k6 부하 테스트 스크립트 (`loadtest/bbox.js`)

## 정식 출시 단계 (다음)

- 마케팅 랜딩 (`/landing`)
- A/B 테스트 인프라 (PostHog 또는 Vercel Edge Config)
- PWA: 홈 화면 추가, 오프라인 폴백
- 안드로이드 TWA / iOS WebClip
- 운영 대시보드 (Supabase 뷰: DAU, 구독 전환율, 광고 eCPM)
- 백오피스 (강제 동기화, 환불, 차단)
- WCAG AA 점검 / 한국어 스크린리더 검수
- 카카오모빌리티 길찾기 API로 경로 LineString 정밀화

자세한 일정은 [`docs/05_단계별_개발계획.md`](./docs/05_단계별_개발계획.md) 참고.

---

데이터 제공: [한국석유공사 오피넷](https://www.opinet.co.kr)
