# repair-sync (서울 Cloud Run)

공공데이터포털 표준데이터를 수집해 Supabase 에 적재하는 **독립 서비스**.
경로로 대상을 고른다 — 셋 다 같은 `api.data.go.kr` 이고 리전·시크릿·배포가 동일해서
Cloud Run 서비스를 나누지 않았다(서비스 이름은 처음 만든 정비소를 따라 그대로 둔다).

| 경로 | 대상 | 테이블 | 원천 |
| --- | --- | --- | --- |
| `POST /` | 자동차 정비소 | `repair_shops` | 전국자동차정비업체표준데이터 |
| `POST /rental` | 렌터카 | `rental_cars` | 전국렌터카업체정보표준데이터 |
| `POST /inspection` | 자동차검사소 | `inspection_stations` | 전국자동차검사소표준데이터 |

⚠️ **API 마다 활용신청이 따로 필요하다.** 키가 있어도 그 API 를 신청하지 않았으면
`SERVICE_KEY_IS_NOT_REGISTERED` 가 온다(키 문제로 오해하기 쉬워 에러 문구에 명시해 뒀다).

## 왜 분리했나
- 앱 본체는 Firebase App Hosting(asia-southeast1 싱가포르). App Hosting 은 서울 리전 미지원.
- `api.data.go.kr` 는 **해외 IP 를 차단** → 싱가포르에서 호출하면 항상 `fetch failed`.
  실측(2026-08-22): 운영에서 3/3 실패(각 10.7초), 로컬 한국 IP 는 0.04초에 200.
- 한국도로공사 API 로 **같은 문제를 겪어 `services/highway-sync` 를 분리한 전례**가 있어 그대로 따랐다.
- 앱의 `/api/internal/sync-repair` 라우트는 남겨 둔다 — 한국 IP(로컬)에서 수동 실행할 때 쓴다.

## 구성
- `server.js` — Node http 서버($PORT). POST + `Bearer ${CRON_SECRET}` 검증, 경로 라우팅, JSON 요약 응답.
- `common.js` — 표준데이터 공통(호출·값 정규화·시군구 판별·수집 루프·stale 정리).
- `sync.js` — 정비소(가장 먼저 만들어져 자체 구현을 유지한다).
- `rental.js` / `inspection.js` — 렌터카 / 검사소. `common.js` 의 `runSync` 를 쓴다.
- `sigungu-data.js` — `lib/sigungu-data.ts` 복사본(자립 실행용).

⚠️ 로직은 앱의 `lib/repair/*`·`lib/rental/*`·`lib/inspection/*`·`lib/dataGoKr/*` 와 **두 벌**이다.
   한쪽만 고치면 조용히 갈라진다 — 바꿀 때 양쪽 다 고칠 것.

### 실패 안전 규칙(세 sync 공통, 사고 재발 방지책)
1. 전체 삭제 후 재삽입 금지 — 부분 실패가 지도를 비우면 안 된다.
2. 정리(delete)는 **완주했을 때만**. 어느 페이지든 실패하면 기존 스냅샷을 그대로 둔다.
3. 정리 전 삭제 대상 수를 세어 수집분의 20% 를 넘으면 중단 —
   `synced_at` 을 upsert 페이로드에 빠뜨려 정비소 테이블이 통째로 비워진 사고가 실제로 있었다.
   (conflict-update 는 컬럼 기본값을 적용하지 않으므로 `synced_at` 은 반드시 행에 실려야 한다.)
4. `?dryRun=1` 로 원천 응답 구조 변화를 쓰기 전에 확인한다.

## 환경변수
| 이름 | 종류 | 설명 |
| --- | --- | --- |
| `DATA_GO_KR_API_KEY` | secret | 공공데이터포털 인증키 |
| `CRON_SECRET` | secret | Bearer 인증(앱과 동일) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Supabase service_role 키 |
| `SUPABASE_URL` | value | Supabase URL |
| `PORT` | (자동) | Cloud Run 주입 |

## 로컬 스모크
```bash
cd services/repair-sync && npm install
DATA_GO_KR_API_KEY=… CRON_SECRET=localtest SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node server.js
curl -s -X POST -H "Authorization: Bearer localtest" "http://localhost:8080/?dryRun=1&maxPages=2"
curl -s -X POST -H "Authorization: Bearer localtest" "http://localhost:8080/rental?dryRun=1&maxPages=2"
curl -s -X POST -H "Authorization: Bearer localtest" "http://localhost:8080/inspection?dryRun=1&maxPages=2"
```

## 배포
```bash
gcloud run deploy repair-sync --source services/repair-sync \
  --region asia-northeast3 --project onek1000 --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=https://qaszteoadtykuzjzqukm.supabase.co \
  --set-secrets DATA_GO_KR_API_KEY=DATA_GO_KR_API_KEY:latest,CRON_SECRET=CRON_SECRET:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest \
  --timeout 600
```
스케줄러(`sync-repair`)의 uri 를 이 서비스 URL 로 바꾼 뒤 resume 한다. 월 1회(매월 1일 03:00 KST).

### 렌터카·검사소 스케줄러 추가
원천 갱신주기가 반기라 월 1회로 충분하다. 같은 서비스의 다른 경로만 지정하면 된다.
```bash
SERVICE_URL=$(gcloud run services describe repair-sync --region asia-northeast3 \
  --project onek1000 --format='value(status.url)')
CRON=$(gcloud secrets versions access latest --secret=CRON_SECRET --project=onek1000)

for job in rental inspection; do
  gcloud scheduler jobs create http sync-$job \
    --location asia-northeast3 --project onek1000 \
    --schedule "0 4 1 * *" --time-zone "Asia/Seoul" \
    --uri "$SERVICE_URL/$job" --http-method POST \
    --headers "Authorization=Bearer $CRON" \
    --attempt-deadline 600s
done
```
정비소(03:00)와 시간을 겹치지 않게 04:00 으로 둔다 — 같은 인스턴스에서 동시에 돌면
메모리·API 호출이 몰린다.

**최초 1회 적재**는 스케줄러를 기다리지 말고 직접 부른다:
```bash
curl -s -X POST -H "Authorization: Bearer $CRON" "$SERVICE_URL/rental?dryRun=1&maxPages=1"   # 먼저 확인
curl -s -X POST -H "Authorization: Bearer $CRON" "$SERVICE_URL/rental"                       # 실제 적재
curl -s -X POST -H "Authorization: Bearer $CRON" "$SERVICE_URL/inspection"
```
