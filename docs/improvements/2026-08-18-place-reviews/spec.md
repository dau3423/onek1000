# 설계 명세: 장소 리뷰 통합 — 세차장·EV 충전소 리뷰 추가

> 작성: 2026-08-18 · 브레인스토밍 합의 결과 · 구현 계획(plan)은 별도 문서

## 목적

현재 리뷰는 주유소 전용이다. 세차장과 EV 충전소에도 리뷰를 쓸 수 있게 한다.
세 종류를 **하나의 리뷰 기능**으로 통합해, 앞으로의 리뷰 개선(신고, 정렬, 사진 정책)을 세 번씩
반복하지 않게 한다.

## 착수 전 실측 (코드 확인 완료)

| 항목 | 사실 |
|---|---|
| 리뷰 테이블 | `reviews.station_id text not null references stations(id) on delete cascade` |
| 기능 | 별점 1~5, 본문 500자, 사진 배열(`photo_paths`), 사용자당 1개(유니크 인덱스), 수정 허용, `is_hidden` 모더레이션 |
| 요약 뷰 | `station_review_stats` (station_id 기준 group by) |
| API | `GET/POST /api/stations/[id]/reviews`, `DELETE /api/reviews/[id]` |
| 사진 경로 | `${userId}/${uuid}.${ext}` — **장소와 무관**하므로 스토리지 변경 불필요 |
| 거리 게이트 | `ReviewForm` 이 현재 위치와 장소 좌표 거리를 재 `allowedM` 초과 시 작성 차단 |
| "내 리뷰" 화면 | **없음** |
| 세차장 PK | `carwash_places.mgmt_no` |
| EV 테이블 | `ev_chargers` — **충전기당 1행**. 충전소 단위 행이 없다 |

### 삭제 경로 실측 (설계의 근거)

| 테이블 | `.delete()` 호출 | 비고 |
|---|---|---|
| `stations` | **없음** | 순위가 밀려도 행은 남는다(해골 마커로 표시) |
| `carwash_places` | **없음** | sync 주석에 "truncate 후 재삽입 절대 금지" 명시 |
| `prices_latest` | 있음 | sync-opinet 의 stale 정리 대상은 **가격**이다 |
| `ev_chargers` | **있음** | sync-ev 가 zcode 완주 시 이번 cycle 미갱신 행 삭제(철거된 충전기 정리) |

> **정정 기록:** 설계 초기에 "sync-opinet 이 주유소를 삭제하므로 기존 리뷰가 소실될 수 있다"고
> 보고했으나 **오독이었다.** `staleDeleted` 변수명만 보고 단정했고, 실제 삭제 대상은 `prices_latest`다.
> 주유소 행은 어디서도 삭제되지 않는다. 이 정정 후에도 결론(FK 제거)은 유지되지만, 근거가 바뀌었다 —
> "기존 구멍 메우기"가 아니라 "EV 구조상 FK 대상이 없다"가 진짜 이유다.

## 확정된 결정

1. **통합 테이블** — 종류별 분리(`ev_reviews` 등) 대신 하나의 `reviews` 테이블에 대상 종류를 둔다.
   분리하면 API·컴포넌트·모더레이션이 3벌이 되고 "내 리뷰"가 UNION 이 된다.
2. **외래키 없음** — 대상을 `(target_type, target_id)` 로만 저장하고 존재 검증은 애플리케이션이 한다.
   한 컬럼으로 세 테이블에 FK 를 걸 수 없고, EV 는 애초에 충전소 단위 행이 없어 FK 대상이 존재하지 않는다.
   삭제 경로가 있는 `ev_chargers` 에서도 사용자 글이 sync 로 사라지지 않는 부수 효과가 있다.
3. **EV 리뷰는 충전소 단위**(`stat_id`) — 충전기 단위로 달면 철거 시 리뷰가 대상을 잃고, 한 곳당 리뷰가
   잘게 흩어진다. 충전기별 고장 여부는 이미 실시간 상태 패널이 보여준다.
4. **기능은 주유소와 완전 동일** — 사진 포함. `photo_paths` 는 이미 있는 컬럼이고, 세차장은 시설 상태를
   글보다 사진으로 보는 편이 빠르다.
5. **기존 `reviews` 를 제자리에서 일반화**(새 테이블 생성 아님).

## 데이터 모델

**마이그레이션 `0040_reviews_polymorphic.sql`**

```sql
alter table reviews add column if not exists target_type text not null default 'gas';
alter table reviews add column if not exists target_id   text;

alter table reviews drop constraint if exists reviews_station_id_fkey;
alter table reviews alter column station_id drop not null;

alter table reviews add constraint reviews_target_type_chk
  check (target_type in ('gas','ev','carwash'));

drop index if exists reviews_user_station_unique;
create unique index if not exists reviews_user_target_unique
  on reviews (user_id, target_type, coalesce(target_id, station_id));

create index if not exists reviews_target_idx
  on reviews (target_type, coalesce(target_id, station_id), created_at desc)
  where is_hidden = false;

create or replace view place_review_stats as
select target_type,
       coalesce(target_id, station_id) as target_id,
       count(*)                       as review_count,
       round(avg(rating)::numeric, 1) as rating_avg,
       count(*) filter (where rating = 5) as r5,
       count(*) filter (where rating = 4) as r4,
       count(*) filter (where rating = 3) as r3,
       count(*) filter (where rating = 2) as r2,
       count(*) filter (where rating = 1) as r1
from reviews
where is_hidden = false
group by target_type, coalesce(target_id, station_id);
```

### 배포 순서 양방향 안전 (이 설계의 핵심 제약)

이 저장소는 마이그레이션을 **운영자가 Supabase 에서 수동 적용**한다. 코드 배포와 적용 순서가 보장되지
않으므로 두 순서 모두에서 깨지지 않아야 한다.

- **마이그레이션 먼저 / 코드 나중**: 구버전 코드는 `station_id` 만 넣는다. `target_type` 의
  `default 'gas'` 가 값을 채우고 `target_id` 는 null 로 남는다. 조회가 `coalesce(target_id, station_id)`
  를 쓰므로 정상 동작한다. **`target_type` 에 기본값을 주지 않았다면 이 순서에서 운영 중 리뷰 작성이
  즉시 실패했을 것이다.**
- **코드 먼저 / 마이그레이션 나중**: 신버전 코드가 컬럼 존재를 감지해 기존 `station_id` 경로로 동작한다
  (0039 에서 쓴 graceful degrade 패턴). EV·세차장 리뷰만 비활성 상태가 된다.

기존 행 백필용 `update` 문은 **필요 없다** — 기존 리뷰는 전부 주유소이고 기본값이 그 값이다.

### `station_review_stats` 는 남긴다

지우면 그 뷰를 읽는 기존 코드가 마이그레이션 적용 즉시 깨진다. 남겨두는 비용은 없다.
소비자를 모두 `place_review_stats` 로 옮긴 뒤 별도로 정리한다.

## API

```
GET/POST  /api/places/[type]/[id]/reviews    신규 (type = gas|ev|carwash)
GET/POST  /api/stations/[id]/reviews         기존 유지 — 내부적으로 type='gas' 로 위임
DELETE    /api/reviews/[id]                  변경 없음(리뷰 UUID 기준이라 이미 종류 무관)
```

기존 라우트를 남기는 이유도 배포 순서다. 브라우저에 떠 있는 구버전 페이지가 새 코드 배포 직후에도
옛 경로로 POST 한다. 위임 한 줄로 그 창에서의 작성 실패를 막는다.

**대상 존재 검증** (FK 를 뺀 자리를 애플리케이션이 메운다):

| type | 확인 |
|---|---|
| `gas` | `stations.id` 존재 |
| `ev` | `ev_chargers` 에 해당 `stat_id` 행이 1건 이상 존재 |
| `carwash` | `carwash_places.mgmt_no` 존재 |

**통계 조회**는 `place_review_stats` 를 읽고, 뷰 부재(마이그레이션 전)면 폴백한다 — `gas` 는 기존
`station_review_stats`, `ev`/`carwash` 는 빈 통계.

**`gas` 리뷰는 전환기 동안 `station_id` 와 `target_id` 를 모두 쓴다.** 명세 자체 점검에서 발견한
구멍이다: 신버전 코드가 `target_id` 만 채우면, 아직 배포되지 않았거나 브라우저에 떠 있는 구버전
코드가 `station_id` 로 조회할 때 **새 리뷰를 못 본다**(사용자에겐 방금 쓴 리뷰가 사라진 것처럼 보인다).
두 컬럼을 함께 채우면 양쪽 리더가 같은 결과를 본다. `ev`/`carwash` 는 `station_id` 를 null 로 둔다
(대상이 `stations` 에 없으므로).

유니크 인덱스가 `coalesce(target_id, station_id)` 인 덕분에 구/신 행이 섞여도 중복이 정확히 걸린다 —
구버전 행(station_id 만)과 신버전 행(둘 다)이 같은 값으로 접히기 때문이다.

**바뀌지 않는 것**: 별점·본문 500자·사용자당 1개·수정 허용·`is_hidden`·사진 업로드 흐름.

## UI · 다국어

**컴포넌트 일반화**

```
ReviewSection({ stationId, stationLat, stationLng })
  → ReviewSection({ targetType, targetId, lat, lng })
```

`ReviewForm` 도 동일하게 바꾼다. EV·세차장 상세 페이지에 주유소와 같은 위치에 얹는다.

**거리 게이트는 세 종류 모두 유지한다.** 두 테이블 다 좌표가 있어 기술적으로 가능하고, 진위 확보라는
이유가 종류와 무관하다. 한 종류만 빼면 그쪽으로 스팸이 몰린다.

**카탈로그 키 이동**: `station.review.*` → `review.*`. 세차장 화면이 `station.review.submit` 을 부르는
것은 동작하되 이름이 사실과 달라진다. `i18n:check` 가 4개 언어 키 일치를 강제하므로 이동 중 누락은
게이트가 잡는다. 한국어 값은 그대로 옮긴다(바이트 동일).

**종류별로 달라야 하는 문구는 ICU `select`** 로 한 키에 담는다:

```json
"emptyState": "{type, select, gas {아직 이 주유소 리뷰가 없어요} ev {아직 이 충전소 리뷰가 없어요} carwash {아직 이 세차장 리뷰가 없어요} other {아직 이 장소의 리뷰가 없어요}}"
```

키를 세 벌로 늘리면 나중에 문구를 고칠 때 한 군데를 놓친다.

**게이트**: 새 문구 전부 4개 로케일(ko/en/zh/ja)에 넣고 `i18n:scan` 0 유지. 영어에서 수량 뒤에 명사가
오면 ICU `plural` 을 쓴다(`1 review` / `2 reviews`) — 같은 실수를 이미 한 번 고쳤다.

## 범위

**포함**: 마이그레이션 0040, 통합 API 라우트 + 기존 라우트 위임, 컴포넌트 일반화, EV·세차장 상세
페이지 배치, 카탈로그 키 이동 및 신규 문구 4개 언어.

**제외**
- **"내 리뷰" 화면** — 지금도 없다. 통합 테이블이 이를 가능하게 하지만 이번 요청이 아니다(YAGNI).
- **신고 기능** — 모더레이션은 `is_hidden` 수동 처리 그대로. 아래 리스크 참조.
- **`station_review_stats` 제거** — 소비자 이전 후 별도 정리.
- **소프트 삭제로의 sync 전환** — 근본 해결이지만 sync 3개와 조회 RPC 전부를 건드려야 하고 이번 범위 밖.

## 리스크 · 미해결

- **모더레이션 부담이 3배가 된다.** 신고 기능이 없어 운영자가 직접 발견해야 하는데 리뷰 대상이 세
  종류로 늘어난다. 사진까지 포함하므로 부적절한 이미지 노출 위험도 같이 늘어난다. 이번 범위 밖이지만
  리뷰량이 늘면 신고 기능이 다음 우선순위가 될 가능성이 높다.
- **고아 리뷰**: FK 가 없으므로 영영 사라진 장소(철거된 충전기 등)의 리뷰가 DB 에 남는다. 화면에는
  나오지 않아 무해하나, 나중에 "내 리뷰" 화면을 만들면 죽은 링크로 보인다. 그때 "없어진 장소" 표기로
  처리한다.
- **EV 대상 검증이 종류마다 다른 모양**이다(`stat_id` 는 여러 행에 중복). 구조가 그러하므로 감수한다.
- **거리 게이트와 EV 좌표 정확도**: 충전소 좌표가 부정확하면 실제 방문자가 리뷰를 못 쓸 수 있다.
  주유소에서 이미 쓰던 임계값을 그대로 적용하되, 실사용에서 차단 사례가 보고되면 조정한다.
