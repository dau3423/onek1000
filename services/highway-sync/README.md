# highway-sync (서울 Cloud Run)

고속도로(휴게소) 주유소 가격/위치를 한국도로공사 API에서 수집해 Supabase에 적재하는 **독립 서비스**.

## 왜 분리했나
- 앱 본체는 Firebase App Hosting(asia-southeast1 싱가포르). App Hosting은 서울 리전 미지원.
- 한국도로공사 API(`data.ex.co.kr/curStateStation`)는 **해외 IP를 차단** → 싱가포르에서 호출하면 항상 `fetch failed`(502).
- **서울(asia-northeast3) IP에서는 정상 응답**. 그래서 고속도로 sync만 서울 Cloud Run으로 분리.
- 적재 규칙/로직은 `app/api/internal/sync-highway/route.ts`, `lib/exoil/client.ts`, `lib/geocode/kakao.ts`에서 포팅(self-contained, `@/` alias 미사용).

## 구성
- `server.js` — Node http 서버($PORT 리슨). POST + `Bearer ${CRON_SECRET}` 검증, JSON 요약 응답.
- `sync.js` — 수집→지오코딩→Supabase upsert 본체.
- `exoil.js` — 도로공사 curStateStation 클라이언트(브라우저 UA + 재시도).
- `geocode.js` — 카카오 로컬 지오코딩(주소→키워드 폴백, 한국 경위도 검증).

## 서비스가 읽는 환경변수
| 이름 | 종류 | 설명 |
| --- | --- | --- |
| `EX_API_KEY` | secret | 한국도로공사 인증키 |
| `CRON_SECRET` | secret | Bearer 인증 비밀값(앱과 동일) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Supabase service_role 키 |
| `KAKAO_REST_API_KEY` | secret(또는 value) | 카카오 REST 키. 없으면 `KAKAO_CLIENT_ID` 사용 |
| `KAKAO_CLIENT_ID` | value/secret | `KAKAO_REST_API_KEY` 폴백 |
| `SUPABASE_URL` | value | Supabase URL(= 앱의 `NEXT_PUBLIC_SUPABASE_URL` 값). 없으면 `NEXT_PUBLIC_SUPABASE_URL` 폴백 |
| `PORT` | (자동) | Cloud Run이 주입 |

## 로컬 스모크
```bash
# 한국 IP(로컬)에서 도로공사 호출 가능. dryRun 으로 upsert 생략 가능.
cd services/highway-sync && npm install
node --env-file=../../.env.local server.js   # Node 20.6+ 의 --env-file
# 다른 터미널:
curl -s -X POST "http://localhost:8080/?dryRun=1" -H "Authorization: Bearer $CRON_SECRET"
```

## 배포 / 스케줄러 연결
프로젝트 루트 작업지시(작업 보고) 참조. 배포는 `gcloud run deploy highway-sync --source services/highway-sync --region asia-northeast3 ...`(Node 빌드팩).
