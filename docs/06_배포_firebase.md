# Onek - Firebase App Hosting 배포 가이드

Firebase App Hosting은 Next.js 14 App Router의 SSR + API Routes + 동적 라우트를 Cloud Run 위에서 그대로 돌려줍니다. 본 가이드는 0→배포까지 전 과정을 정리합니다.

> Firebase 프로젝트 ID: `onek1000`
> App Hosting 기본 도메인: `https://onek1000--onek1000.<region>.hosted.app`
> 커스텀 도메인 (예정): `https://onek1000.kr`
>
> ⚠️ `.web.app` / `.firebaseapp.com`은 **옛 Firebase Hosting 전용** 도메인이며,
>    App Hosting에는 자동 연결되지 않습니다. 무료 도메인은 `.hosted.app`을 그대로 사용.

---

## 0. 사전 준비

```bash
# Firebase CLI 설치 (전역)
npm install -g firebase-tools

# 로그인 (브라우저 인증)
firebase login

# 프로젝트 ID 확인
firebase projects:list
# → onek1000 이 보이면 OK
```

이 리포의 `.firebaserc`에 이미 `default: onek1000`이 박혀있어 별도 설정 불필요.

---

## 1. Firebase Console에서 App Hosting 백엔드 생성 (1회)

1. https://console.firebase.google.com/project/onek1000/apphosting 진입
2. **백엔드 만들기** 클릭
3. GitHub 리포 연결 → 이 리포 선택
4. **Branch**: `main` (또는 배포할 브랜치)
5. **Root directory**: `/` (기본값)
6. **Backend ID**: `onek1000` (이 리포의 `firebase.json`과 동일하게)
7. **Region**: `asia-northeast3` 한국 region이 보이면 선택, 없으면 `us-central1`
8. 생성 후 자동 첫 빌드가 시작됨 (5~10분)

이후 `main`에 push할 때마다 자동 빌드/배포됩니다.

---

## 2. Secret 등록 (1회)

비밀값은 GCP Secret Manager에 저장 후 `apphosting.yaml`에서 참조합니다. 한 번씩 실행:

```bash
firebase apphosting:secrets:set NEXTAUTH_SECRET
# → openssl rand -base64 32 결과를 붙여넣기

firebase apphosting:secrets:set CRON_SECRET
# → 임의의 긴 랜덤 문자열

firebase apphosting:secrets:set OPINET_API_KEY
firebase apphosting:secrets:set SUPABASE_SERVICE_ROLE_KEY
firebase apphosting:secrets:set UPSTASH_REDIS_REST_TOKEN
firebase apphosting:secrets:set KAKAO_CLIENT_SECRET
firebase apphosting:secrets:set GOOGLE_CLIENT_SECRET
firebase apphosting:secrets:set TOSS_PAYMENTS_SECRET_KEY
firebase apphosting:secrets:set VAPID_PRIVATE_KEY
```

각 secret은 GCP Secret Manager의 `projects/onek1000/secrets/<NAME>`에 저장됩니다.

**공개 환경변수** (Supabase URL, AnonKey, Kakao Client ID 등)는 `apphosting.yaml`의 `value:`에 직접 적습니다. 발급받는 대로 PR에 함께 커밋.

### 2-1. Supabase Storage 버킷 생성 — 리뷰 사진용

리뷰 사진은 Supabase Storage의 `review-photos` 버킷에 올라갑니다. **콘솔에서 1회 설정**:

1. Supabase 콘솔 → **Storage** → **New bucket**
2. Name: `review-photos`
3. **Public: OFF** (private 버킷, 서명 URL로만 접근)
4. File size limit: `5 MB`
5. Allowed MIME types: `image/jpeg, image/png, image/webp, image/heic, image/heif`
6. **Save**

서비스 롤 키로만 업로드/삭제하므로 RLS 정책은 기본값 그대로 두어도 됩니다 (서비스 키는 RLS 우회).

---

## 3. 카카오 디벨로퍼스 도메인 추가 (필수)

[카카오 디벨로퍼스 콘솔](https://developers.kakao.com) → 앱 → **앱 설정 → 플랫폼 → Web** 에 다음 도메인 추가:

```
http://localhost:3000                                       (개발)
https://onek1000--onek1000.asia-southeast1.hosted.app       (App Hosting 운영)
https://<branch>--onek1000-<hash>.asia-southeast1.hosted.app  (PR preview, 새 도메인 생길 때마다 추가)
https://onek1000.kr                                          (커스텀 도메인)
```

> 카카오 디벨로퍼스는 와일드카드 도메인 미지원이라 미리보기 채널 도메인은 필요할 때마다 추가해야 합니다. main 안정 도메인은 위 4번째 줄 1개로 충분.

---

## 4. NextAuth Redirect URI 설정

소셜 로그인 활성화 시:

### 카카오 로그인
**카카오 디벨로퍼스 → 제품 설정 → 카카오 로그인 → Redirect URI**
```
https://onek1000.kr/api/auth/callback/kakao
https://onek1000--onek1000.asia-southeast1.hosted.app/api/auth/callback/kakao
http://localhost:3000/api/auth/callback/kakao
```

### 구글 로그인
**GCP Console → API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트 ID → 승인된 리디렉션 URI**
```
https://onek1000.kr/api/auth/callback/google
https://onek1000--onek1000.asia-southeast1.hosted.app/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

---

## 5. 커스텀 도메인 연결 (`onek1000.kr`)

1. https://console.firebase.google.com/project/onek1000/apphosting → 백엔드 선택 → **도메인 추가**
2. `onek1000.kr` 입력
3. Firebase가 표시하는 TXT 레코드를 도메인 등록처(가비아/Cloudflare 등) DNS에 등록 → 소유권 인증
4. 인증 통과 후 A 레코드 (또는 ALIAS/ANAME)를 Firebase가 안내하는 IP로 설정
5. 자동 SSL 발급 (24시간 이내)

연결되면 `apphosting.yaml`의 `NEXTAUTH_URL` 값을 `https://onek1000.kr`로 유지(이미 그렇게 되어있음).

---

## 6. 로컬에서 Firebase 빌드 검증

App Hosting은 Cloud Build에서 `npm run build` → `npm run start`를 실행합니다. 동일한 흐름을 로컬에서 미리 확인:

```bash
npm install
npm run typecheck
npm run build
npm run start
# http://localhost:3000 접속 후 동작 확인
```

이게 통과하면 App Hosting 빌드도 거의 확실히 통과합니다.

---

## 7. Cron (Opinet 동기화 + 정기결제) 옮기기

Vercel Cron이 Firebase에는 없으니, **Cloud Scheduler + HTTPS 트리거**로 대체합니다.

```bash
# 1) Cloud Scheduler API 활성화 (1회)
gcloud services enable cloudscheduler.googleapis.com --project=onek1000

# 2) Opinet 동기화 — 매시 5분
gcloud scheduler jobs create http opinet-sync \
  --project=onek1000 \
  --location=asia-northeast3 \
  --schedule="5 * * * *" \
  --time-zone="Asia/Seoul" \
  --http-method=POST \
  --uri="https://onek1000.kr/api/internal/sync-opinet" \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --attempt-deadline=120s

# 3) 정기결제 — 매시 10분
gcloud scheduler jobs create http billing-charge \
  --project=onek1000 \
  --location=asia-northeast3 \
  --schedule="10 * * * *" \
  --time-zone="Asia/Seoul" \
  --http-method=POST \
  --uri="https://onek1000.kr/api/billing/charge-cron" \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --attempt-deadline=120s

# 4) 시장 데이터 동기화(주유 타이밍 예측 선행지표) — 1일 1회 00:45 KST
#    국제유가(Dubai/Brent/WTI)·MOPS 프록시·USD/KRW·국내 전국평균 소매가 적재.
#    최초 백필은 ?from=YYYYMMDD 로 1회 수동 호출(아래 '수동 백필' 참조).
gcloud scheduler jobs create http market-sync \
  --project=onek1000 \
  --location=asia-northeast3 \
  --schedule="45 0 * * *" \
  --time-zone="Asia/Seoul" \
  --http-method=POST \
  --uri="https://onek1000.kr/api/internal/sync-market" \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --attempt-deadline=120s
```

시장 데이터 최초 백필(예: 2024-01-01부터, 1회만):
```bash
curl -X POST "https://onek1000.kr/api/internal/sync-market?from=20240101" \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

```bash
# 5) 주유 타이밍 예측 생성·평가 — 1일 1회 00:55 KST (반드시 market-sync 이후)
#    오늘자 방향성(up/flat/down) 예측을 price_forecast 에 upsert 하고,
#    target_date 지난 과거 예측을 실제 국내가 변화와 비교해 forecast_eval 에 채점한다.
gcloud scheduler jobs create http run-forecast \
  --project=onek1000 \
  --location=asia-northeast3 \
  --schedule="55 0 * * *" \
  --time-zone="Asia/Seoul" \
  --http-method=POST \
  --uri="https://onek1000.kr/api/internal/run-forecast" \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --attempt-deadline=120s
```

예측 누적 정확도(hit-rate) 즉시 채우기 — 적재된 과거 데이터로 소급 생성·평가(1회):
```bash
# 백필(과거 시점 예측을 미래정보 누설 없이 소급 산출 + 평가). from 생략 시 데이터 시작 이후 전체.
curl -X POST "https://onek1000.kr/api/internal/run-forecast?backfill=1&from=2024-02-01" \
  -H "Authorization: Bearer ${CRON_SECRET}"

# 누적 정확도/최근 예측 조회(내부 검증용 JSON, 대시보드 UI 없음)
curl "https://onek1000.kr/api/internal/forecast-accuracy" \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

`CRON_SECRET`은 6번 단계에서 등록한 secret과 동일한 값 사용. `${CRON_SECRET}`은 쉘에서 실제 값으로 치환하거나, 또는 `--oidc-service-account-email`로 더 보안 강화 가능.

수정/삭제:
```bash
gcloud scheduler jobs update http opinet-sync --schedule="*/30 * * * *" --location=asia-northeast3
gcloud scheduler jobs delete opinet-sync --location=asia-northeast3
```

`vercel.json`은 Vercel 환경에서만 사용되고 Firebase에서는 무시되므로, 둘 다 운영 가능성이 있다면 함께 두고, Vercel 백업 안 할 거면 삭제해도 됩니다.

---

## 8. 배포 (자동)

GitHub `main` 브랜치에 push하면 Firebase가 자동으로:
1. 코드 fetch
2. `npm install`
3. `npm run build`
4. Cloud Run 컨테이너 이미지 빌드
5. 트래픽 전환 (Zero downtime)

로그는 https://console.firebase.google.com/project/onek1000/apphosting → 빌드 탭에서 실시간 확인.

---

## 9. 트러블슈팅

| 증상 | 원인 / 해결 |
|------|--------|
| "허용되지 않은 도메인" (카카오맵) | 3번 단계 — 카카오 디벨로퍼스에 배포 도메인 추가 |
| `Cannot find module 'next-auth'` | `npm install` 후 다시 빌드 (Firebase Cloud Build 캐시 문제 시 재배포) |
| 빌드는 통과, 런타임 500 | Firebase Console → App Hosting → 로그 확인. 대부분 환경변수 누락 |
| Secret 못 찾음 | `firebase apphosting:secrets:list`로 등록 상태 확인 |
| Cold start 느림 | `apphosting.yaml`의 `minInstances: 1` 로 변경 (요금 발생) |
| SSR된 카카오맵이 빈 화면 | 정상 — KakaoMap은 `ssr:false` dynamic. 클라이언트에서 SDK 로드 후 렌더 |

---

## 10. 비용 가이드 (참고)

App Hosting은 Cloud Run + Cloud Build + Artifact Registry 사용량으로 청구.

| 항목 | 무료 한도 | 비용 발생 시점 |
|------|----------|-----|
| Cloud Run | 월 200만 요청 무료 | 그 이상 시 |
| Cloud Build | 일 120분 무료 | 빈번한 빌드 시 |
| Artifact Registry | 0.5GB 무료 | 이미지 누적 |
| Cloud Scheduler | 작업 3개 무료 | 4번째 작업부터 |

DAU 10,000 수준까지는 대부분 무료 한도 내. 운영 청구는 https://console.cloud.google.com/billing 에서 모니터링.
