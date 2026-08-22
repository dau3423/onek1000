# ev-sync (서울 Cloud Run)

한국환경공단 「전기차 충전소 정보」(data.go.kr `B552584/EvCharger`)를 수집해
Supabase `ev_chargers` 에 적재하는 **독립 서비스**.

## 왜 분리했나
- 앱 본체는 Firebase App Hosting(asia-southeast1 싱가포르). App Hosting 은 서울 리전 미지원.
- `apis.data.go.kr` 는 **해외 IP 를 차단** → 싱가포르에서 호출하면 항상 `fetch failed`.
  (`api.data.go.kr` 와 같은 IP 27.101.236.63.)
- 그 결과 `sync-ev` 는 **2026-06-03 이후 두 달 반 동안 멈춰 있었다**(크론도 등록돼 있지 않았다).
- 한국도로공사 API(`services/highway-sync`), 정비소 API(`services/repair-sync`) 로 같은 문제를
  두 번 겪어 분리한 전례가 있어 그대로 따랐다.
- 앱의 `/api/internal/sync-ev` 라우트는 남겨 둔다 — 한국 IP(로컬)에서 수동 실행할 때 쓴다.

## 구성
- `server.js` — Node http 서버($PORT). `Bearer ${CRON_SECRET}` 검증, JSON 요약 응답.
- `sync.js` — zcode 별 페이지네이션 → 정규화 → 페이지 단위 즉시 upsert → 커서 저장 → stale 정리.
- `sigungu-data.js` — `lib/sigungu-data.ts` 복사본(자립 실행용).

⚠️ 로직은 앱의 `lib/ev/{client,row}.ts` + `lib/regions/addressMatch.ts` 와 **두 벌**이다.
   한쪽만 고치면 조용히 갈라진다 — 바꿀 때 양쪽 다 고칠 것.

## 규모와 커서(이 서비스의 핵심)
- 원천 총 **약 526,000 행**(충전기 단위). 시도별 편차가 크다: 경기 154,904 / 서울 75,966 / 세종 6,562.
- 한 번에 다 못 끝날 수 있으므로 **페이지 커서**(`ev_sync_state.next_page`)를 쓴다.
  매 페이지 upsert 직후 커서를 저장하므로, 중간에 죽어도 받은 만큼 남고 다음 실행이 이어받는다.
- `cycle` 을 완주한(마지막 페이지까지 받은) zcode 에 **한해서만** stale 정리를 한다.
  부분 수신 zcode 는 절대 정리하지 않는다(과거 Opinet 부분 sync 과삭제 사고 교훈).
- 마지막 페이지 판정은 **원천 totalCount 로만** 한다. `?maxPages` 로 자른 값을 섞으면
  부분 수신을 완주로 오인해 멀쩡한 행을 지운다.
- 정리 안전판: 삭제 대상이 그 시도 원천 총건수의 **20% 를 넘으면 지우지 않는다**.
  (repair 에서 `synced_at` 을 upsert payload 에 안 실어 테이블을 통째로 비운 사고가 있었다.
  이 서비스는 `synced_at` 을 반드시 싣고, 그 위에 이 비율 안전판을 더 뒀다.)

## 행정구역 개편 — zcode 12
2026-08-22 zcode 01~99 전수 스캔 결과, **광주광역시(29) + 전라남도(46) 가
「전남광주통합특별시」(zcode `12`, 32,870건)로 통합**됐고 29·46 은 `totalCount=0` 만 준다.
- `EV_ZCODES` 에서 29·46 을 빼고 12 를 넣었다(앱 `lib/ev/client.ts` 도 동일하게 수정).
- DB 에 남아 있던 옛 29·46 행은 **12 가 건강하게(1만건 이상) 완주했을 때만** 지운다
  (`purgeRetiredZcodes`) — 원천 일시 장애로 12 가 비어 올 때 옛 데이터까지 날리지 않기 위한 안전판.
- 주소 표기도 `전남광주통합특별시 …` 로 바뀌어, `addressMatch` 에 통합 표기를 추가했다.
  없으면 '전남'만 잡혀 광주 시군구(북구/광산구 등)가 전부 `sigungu_code = null` 이 된다.

## 환경변수
| 이름 | 종류 | 설명 |
| --- | --- | --- |
| `EV_CHARGER_API_KEY` | secret | 공공데이터포털 인증키(EvCharger) |
| `CRON_SECRET` | secret | Bearer 인증(앱과 동일) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Supabase service_role 키 |
| `SUPABASE_URL` | value | Supabase URL |
| `PORT` | (자동) | Cloud Run 주입 |

## 쿼리 파라미터
| 파라미터 | 뜻 |
| --- | --- |
| `dryRun=1` | 쓰기(upsert/정리/커서저장) 전부 생략, 수집·정규화 통계만 |
| `zcode=41` | 그 시도 하나만 sync |
| `maxPages=N` | 시도당 페이지 상한(스모크용). 완주 판정에는 쓰지 않는다 |
| `budgetMs=N` | 이번 호출 시간예산(기본 3,300,000ms) |

## 로컬 스모크
```bash
cd services/ev-sync && npm install
EV_CHARGER_API_KEY=… CRON_SECRET=localtest SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node server.js
curl -s -X POST -H "Authorization: Bearer localtest" "http://localhost:8080/?dryRun=1&maxPages=1"
```

## 배포
```bash
gcloud run deploy ev-sync --source services/ev-sync \
  --region asia-northeast3 --project onek1000 --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=https://qaszteoadtykuzjzqukm.supabase.co \
  --set-secrets EV_CHARGER_API_KEY=EV_CHARGER_API_KEY:latest,CRON_SECRET=CRON_SECRET:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest \
  --timeout 3600
```

## 크론
`sync-ev` — 매일 04:00 / 10:00 / 16:00 / 22:00 KST (`0 4,10,16,22 * * *`), attempt-deadline 30분.
- 원천 API 는 빨라졌다(1500행 페이지 0.26초 실측). 전국 1바퀴 API 호출은 약 360건뿐이라
  하루 4바퀴여도 1,440건 — data.go.kr 한도에 여유가 크다.
- 실제 비용은 Supabase upsert(1바퀴 526k 행)라 그 이상 자주 돌리는 건 이득이 적다.
- 충전기 **실시간 상태**는 상세 진입 시 `evGetChargerInfoByStatId` 로 그때그때 라이브 조회하므로,
  배치는 정적정보 + 대략의 상태 스냅샷 갱신이면 충분하다.
- 기존 크론(00:00, 00:45, 00:55, 01:00, 02:00, 03:00, 05:30, 07:30, 08:00)과 겹치지 않는다.
