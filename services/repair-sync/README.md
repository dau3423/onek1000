# repair-sync (서울 Cloud Run)

공공데이터포털 「전국자동차정비업체표준데이터」를 수집해 Supabase `repair_shops` 에 적재하는 **독립 서비스**.

## 왜 분리했나
- 앱 본체는 Firebase App Hosting(asia-southeast1 싱가포르). App Hosting 은 서울 리전 미지원.
- `api.data.go.kr` 는 **해외 IP 를 차단** → 싱가포르에서 호출하면 항상 `fetch failed`.
  실측(2026-08-22): 운영에서 3/3 실패(각 10.7초), 로컬 한국 IP 는 0.04초에 200.
- 한국도로공사 API 로 **같은 문제를 겪어 `services/highway-sync` 를 분리한 전례**가 있어 그대로 따랐다.
- 앱의 `/api/internal/sync-repair` 라우트는 남겨 둔다 — 한국 IP(로컬)에서 수동 실행할 때 쓴다.

## 구성
- `server.js` — Node http 서버($PORT). POST + `Bearer ${CRON_SECRET}` 검증, JSON 요약 응답.
- `sync.js` — 수집→정규화(브랜드·시군구 판별)→Supabase upsert→stale 정리.
- `sigungu-data.js` — `lib/sigungu-data.ts` 복사본(자립 실행용).

⚠️ 로직은 앱의 `lib/repair/*` + `lib/regions/addressMatch.ts` 와 **두 벌**이다.
   한쪽만 고치면 조용히 갈라진다 — 바꿀 때 양쪽 다 고칠 것.

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
