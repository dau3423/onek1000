# 장소 리뷰 통합 + 신고·모더레이션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세차장·EV 충전소에도 리뷰를 쓸 수 있게 하고, 신고 접수 + 개인 숨김 + 운영자 모더레이션 화면을 신설한다.

**Architecture:** 기존 `reviews` 테이블을 `(target_type, target_id)` 다형 구조로 제자리 일반화한다. 외래키는 걸지 않고(대상 테이블이 셋이고 EV는 충전소 단위 행이 없다) 존재 검증은 애플리케이션이 한다. 신고는 별도 `review_reports` 테이블에 쌓이며, 신고 즉시 신고자에게만 그 리뷰가 숨겨지고 전역 숨김은 운영자가 `/admin/reviews`에서 판단한다.

**Tech Stack:** Next.js 14.2.5 (App Router) · React 18.3.1 · TypeScript 5.5.3 · Supabase(PostgreSQL) · next-intl 4.13.7

**Spec:** [spec.md](./spec.md)

## Global Constraints

- **마이그레이션은 운영자가 Supabase에서 수동 적용한다.** 코드 배포와 적용 순서가 보장되지 않으므로 **두 순서 모두에서 앱이 깨지지 않아야 한다**(0039에서 쓴 컬럼 존재 감지 → graceful degrade 패턴).
- **`gas` 리뷰는 전환기 동안 `station_id`와 `target_id`를 모두 쓴다.** `target_id`만 쓰면 구버전 리더가 새 리뷰를 못 본다.
- 대상 종류는 정확히 `'gas' | 'ev' | 'carwash'` 세 가지.
- **지오펜스는 서버가 권위**다(클라이언트 검사는 UX용). 세 종류 모두 적용하며 기존 상수를 그대로 쓴다: `REVIEW_GEOFENCE_M = 500`, `REVIEW_GEOFENCE_ACCURACY_CAP_M = 300`.
- **자동 전역 숨김은 구현하지 않는다.** 임계 자동 숨김은 업주가 불리한 리뷰를 조직적으로 내리는 경로가 된다.
- 리뷰 규칙 불변: 별점 1~5, 본문 `REVIEW_CONTENT_MAX = 500`자, 사진 최대 `REVIEW_PHOTO_MAX = 5`장, 사용자당 대상당 1개, 수정 허용.
- **다국어**: 새 사용자 문구는 전부 `ko`/`en`/`zh`/`ja` 4개 카탈로그에 넣는다. `npm run i18n:scan`은 **0을 유지**해야 한다. 영어에서 수량 뒤에 명사가 오면 ICU `plural`을 쓴다. `/admin/*`은 다국어 대상이 아니다(한국어 전용).
- **DB 원본 문자열은 번역하지 않는다**: 장소 이름·주소, 사용자가 쓴 리뷰 본문.
- **이 저장소에는 단위 테스트 러너가 없다**(scripts: dev/build/start/lint/typecheck/i18n:check/i18n:scan). 테스트 프레임워크 도입은 범위 밖이다. 각 태스크의 검증 게이트는 `npm run typecheck` → `npm run lint` → `npm run i18n:check` → `npm run i18n:scan` → `npm run build`이며, 동작 확인은 dev 서버 + curl/헤드리스 브라우저로 한다.
- 커밋 메시지는 **한국어**로, 무엇이 아니라 **왜**를 남긴다.
- `git checkout` 기반 원복 테스트 전에는 반드시 `git add`로 스테이지한다.

---

## 파일 구조

**신규**

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0040_reviews_polymorphic.sql` | `reviews` 다형화 + `place_review_stats` 뷰 |
| `supabase/migrations/0041_review_reports.sql` | `review_reports` 테이블 |
| `lib/places/target.ts` | 장소 종류별 존재 검증 + 좌표 조회(지오펜스용) 단일 출처 |
| `lib/api/place-reviews.ts` | 리뷰 GET/POST 핸들러 본체(라우트 간 공유) |
| `app/api/places/[type]/[id]/reviews/route.ts` | 통합 리뷰 라우트 — 종류 검증 후 공통 핸들러 호출 |
| `app/api/reviews/[id]/report/route.ts` | 신고 접수 |
| `app/api/admin/reviews/reports/route.ts` | 미처리 신고 목록(관리자) |
| `app/api/admin/reviews/[id]/route.ts` | 전역 숨김/해제(관리자) |
| `app/api/admin/reviews/reports/[id]/dismiss/route.ts` | 신고 기각(관리자) |
| `app/admin/reviews/page.tsx` + `ReviewsAdminClient.tsx` | 모더레이션 화면 |
| `components/reviews/ReportButton.tsx` | 신고 버튼 + 사유 선택 모달 |

**수정**

| 파일 | 변경 |
|---|---|
| `types/review.ts` | `PlaceType`, `Review.targetType/targetId`, 신고 사유 타입 |
| `app/api/stations/[id]/reviews/route.ts` | 통합 라우트로 위임하는 얇은 껍데기로 축소 |
| `lib/mock/reviews.ts` | `stationId` → `(targetType, targetId)` |
| `components/reviews/ReviewSection.tsx` · `ReviewForm.tsx` · `ReviewList.tsx` | props 일반화 + 신고 버튼 |
| `app/(intl)/station/[id]/page.tsx` | 새 props로 호출 |
| `app/(intl)/ev/[statId]/page.tsx` · `app/(intl)/carwash/[id]/page.tsx` | 리뷰 섹션 추가 |
| `messages/{ko,en,zh,ja}.json` | `station.review.*` → `review.*` 이동 + 신규 문구 |

---

## Task 1: 마이그레이션 0040 + 타입 · 대상 헬퍼

화면 변화 없음. 배선만 깔고 기존 동작이 그대로인지 확인하는 것이 목적이다.

**Files:**
- Create: `supabase/migrations/0040_reviews_polymorphic.sql`, `lib/places/target.ts`
- Modify: `types/review.ts`

**Interfaces:**
- Produces: `type PlaceType = 'gas' | 'ev' | 'carwash'`, `isPlaceType(v: string): v is PlaceType`, `resolvePlaceTarget(sb, type, id): Promise<{ exists: boolean; lat: number | null; lng: number | null }>` — 이후 모든 태스크가 이걸 쓴다.

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/0040_reviews_polymorphic.sql`:

```sql
-- 1000냥 주유소 - 리뷰 다형화(주유소 전용 → 장소 공통)
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 배포 순서 양방향 안전이 이 마이그레이션의 핵심이다:
--   - 마이그레이션 먼저 / 코드 나중: 구버전 코드는 station_id 만 넣는다. target_type 의 default 'gas' 가
--     값을 채우고 target_id 는 null 로 남으며, 조회가 coalesce(target_id, station_id) 를 쓰므로
--     정상 동작한다. default 가 없으면 이 순서에서 운영 중 리뷰 작성이 즉시 실패한다.
--   - 코드 먼저 / 마이그레이션 나중: 신버전 코드가 컬럼 부재를 감지해 기존 station_id 경로로 동작한다.
--
-- FK 를 제거하는 이유: 대상 테이블이 셋(stations/ev_chargers/carwash_places)이라 한 컬럼으로 FK 를
--   걸 수 없고, EV 는 충전기당 1행이라 충전소 단위 FK 대상 자체가 없다. 존재 검증은 애플리케이션이 한다.
--
-- 멱등: add column if not exists / create index if not exists / create or replace 라 재적용 안전.

alter table reviews add column if not exists target_type text not null default 'gas';
alter table reviews add column if not exists target_id   text;

alter table reviews drop constraint if exists reviews_station_id_fkey;
alter table reviews alter column station_id drop not null;

alter table reviews drop constraint if exists reviews_target_type_chk;
alter table reviews add constraint reviews_target_type_chk
  check (target_type in ('gas','ev','carwash'));

-- 사용자당 대상당 1개. coalesce 덕분에 구행(station_id만)과 신행(둘 다)이 같은 값으로 접혀
-- 전환기에 섞여 있어도 중복이 정확히 걸린다.
drop index if exists reviews_user_station_unique;
create unique index if not exists reviews_user_target_unique
  on reviews (user_id, target_type, coalesce(target_id, station_id));

create index if not exists reviews_target_idx
  on reviews (target_type, coalesce(target_id, station_id), created_at desc)
  where is_hidden = false;

-- 장소 공통 별점 요약. 기존 station_review_stats 는 지우지 않는다 —
-- 지우면 그 뷰를 읽는 기존 코드가 적용 즉시 깨진다. 소비자 이전 후 별도로 정리한다.
create or replace view place_review_stats as
select target_type,
       coalesce(target_id, station_id) as target_id,
       count(*)                        as review_count,
       round(avg(rating)::numeric, 1)  as rating_avg,
       count(*) filter (where rating = 5) as r5,
       count(*) filter (where rating = 4) as r4,
       count(*) filter (where rating = 3) as r3,
       count(*) filter (where rating = 2) as r2,
       count(*) filter (where rating = 1) as r1
from reviews
where is_hidden = false
group by target_type, coalesce(target_id, station_id);
```

- [ ] **Step 2: 타입 추가**

Modify `types/review.ts` — 파일 맨 위 `Review` 인터페이스 **앞**에 추가:

```ts
/** 리뷰를 달 수 있는 장소 종류. DB target_type 값과 1:1. */
export type PlaceType = 'gas' | 'ev' | 'carwash';

export const PLACE_TYPES: readonly PlaceType[] = ['gas', 'ev', 'carwash'] as const;

export function isPlaceType(v: string | undefined | null): v is PlaceType {
  return !!v && (PLACE_TYPES as readonly string[]).includes(v);
}
```

그리고 `Review` 인터페이스의 `stationId` 줄 **아래에** 두 필드를 **선택적으로** 추가한다.
`stationId` 는 이 태스크에서 건드리지 않는다:

```ts
  stationId: string;
  /** 장소 종류. T2(API)·T3(컴포넌트)가 채우기 시작하면 그때 필수로 조인다. */
  targetType?: PlaceType;
  /** 장소 식별자 — gas=stations.id, ev=ev_chargers.stat_id, carwash=carwash_places.mgmt_no. */
  targetId?: string;
```

> **선택적으로 두는 이유**: 여기서 `stationId` 를 곧장 교체하면 아직 손대지 않은 4개 파일
> (`app/api/stations/[id]/reviews/route.ts`, `lib/mock/reviews.ts`, 리뷰 컴포넌트들)이 컴파일되지 않고,
> 이 태스크의 커밋이 **깨진 트리**를 남긴다. 중간에 멈추면 브랜치가 빌드되지 않는다.
> 필수 전환은 그 파일들을 실제로 다시 쓰는 T2·T3 에서 한다.

`CreateReviewInput` 은 그대로 둔다 — 대상은 URL 경로로 전달되므로 본문에 넣지 않는다.

- [ ] **Step 3: 대상 헬퍼 작성**

Create `lib/places/target.ts`:

```ts
// 장소 종류별 "존재하는가 + 좌표는 무엇인가" 단일 출처.
// reviews 에서 외래키를 뺐으므로(대상 테이블이 셋, EV 는 충전소 단위 행이 없음) 존재 검증을
// 애플리케이션이 대신한다. 지오펜스 좌표 조회도 종류마다 테이블/컬럼이 달라 여기서 흡수한다.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlaceType } from '@/types/review';

export interface PlaceTarget {
  exists: boolean;
  lat: number | null;
  lng: number | null;
}

/**
 * 대상 장소의 존재 여부와 좌표를 조회한다.
 * ev 는 충전소 단위 행이 없어 stat_id 로 아무 충전기 1행을 집는다(좌표는 충전소 공통).
 * 좌표가 없으면 lat/lng 가 null 이며, 호출부는 지오펜스를 건너뛴다(정상 사용자를 막지 않기 위해).
 */
export async function resolvePlaceTarget(
  sb: SupabaseClient,
  type: PlaceType,
  id: string,
): Promise<PlaceTarget> {
  const miss: PlaceTarget = { exists: false, lat: null, lng: null };
  if (!id) return miss;

  if (type === 'gas') {
    const { data } = await sb.from('stations').select('lat, lng').eq('id', id).maybeSingle();
    if (!data) return miss;
    return { exists: true, lat: num(data.lat), lng: num(data.lng) };
  }
  if (type === 'ev') {
    const { data } = await sb
      .from('ev_chargers')
      .select('lat, lng')
      .eq('stat_id', id)
      .limit(1)
      .maybeSingle();
    if (!data) return miss;
    return { exists: true, lat: num(data.lat), lng: num(data.lng) };
  }
  const { data } = await sb
    .from('carwash_places')
    .select('lat, lng')
    .eq('mgmt_no', id)
    .maybeSingle();
  if (!data) return miss;
  return { exists: true, lat: num(data.lat), lng: num(data.lng) };
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 4: 게이트 통과 확인**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: **전부 통과한다.** 새 필드가 선택적이라 기존 코드는 그대로 컴파일된다. 오류가 하나라도 나면
`Review` 를 소비하는 예상 밖의 코드가 있다는 뜻이므로 **고치지 말고 보고**한다 — 계획이 놓친 소비자다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/0040_reviews_polymorphic.sql types/review.ts lib/places/target.ts
git commit -m "feat(reviews): 리뷰 다형화 스키마 + 장소 대상 헬퍼

주유소 전용이던 리뷰를 세차장·EV 충전소로 넓히기 위한 기반.

- 0040: reviews 에 (target_type, target_id) 추가. target_type 에 default 'gas' 를 주는 것이
  핵심이다 — 마이그레이션이 코드보다 먼저 적용되는 순서에서 구버전 코드가 station_id 만 넣어도
  기본값이 채워져 운영 중 리뷰 작성이 깨지지 않는다.
- FK 제거: 대상 테이블이 셋이라 한 컬럼으로 FK 를 걸 수 없고, EV 는 충전기당 1행이라 충전소 단위
  FK 대상 자체가 없다. 존재 검증은 lib/places/target.ts 가 대신한다.
- 기존 station_review_stats 는 남긴다. 지우면 그 뷰를 읽는 코드가 적용 즉시 깨진다."
```

---

## Task 2: 통합 리뷰 API

**Files:**
- Create: `app/api/places/[type]/[id]/reviews/route.ts`
- Modify: `app/api/stations/[id]/reviews/route.ts`, `lib/mock/reviews.ts`

**Interfaces:**
- Consumes: `PlaceType`, `isPlaceType`, `resolvePlaceTarget`(Task 1)
- Produces: `GET/POST /api/places/[type]/[id]/reviews` — 응답은 기존과 동일한 `{ reviews: Review[], stats: ReviewStats }` / `{ ok: true, review: Review }`

- [ ] **Step 1: mock 헬퍼 일반화**

Modify `lib/mock/reviews.ts` — 세 함수의 키를 대상 쌍으로 바꾼다:

```ts
export function listMockReviews(targetType: PlaceType, targetId: string): Review[] {
  return MOCK.filter((r) => r.targetType === targetType && r.targetId === targetId);
}

export function appendMockReview(r: Review) {
  MOCK.unshift(r);
}

export function removeMockReview(id: string) {
  const i = MOCK.findIndex((r) => r.id === id);
  if (i >= 0) MOCK.splice(i, 1);
}
```

파일 상단 시드 데이터의 각 항목에 `targetType: 'gas'` 와 `targetId: <기존 stationId 값>` 을 넣고 `stationId` 는 지운다. `import type { PlaceType } from '@/types/review';` 를 추가한다.

- [ ] **Step 2: 통합 라우트 작성 — GET**

Create `app/api/places/[type]/[id]/reviews/route.ts`. 기존 `app/api/stations/[id]/reviews/route.ts` 를 통째로 복사한 뒤 아래를 바꾼다:

1. 시그니처를 `{ params }: { params: { type: string; id: string } }` 로.
2. 함수 진입부에서 종류 검증:

```ts
  if (!isPlaceType(params.type)) {
    return NextResponse.json({ error: 'invalid place type' }, { status: 400 });
  }
  const targetType = params.type;
```

3. mock 분기를 `listMockReviews(targetType, params.id)` 로.
4. **id 형식을 먼저 검증한다.** 아래 `or` 필터는 경로값을 PostgREST 필터 **문법 문자열**에 그대로
   넣으므로, 쉼표·괄호·점이 든 값이면 필터가 의도와 다르게 파싱된다. 세 종류의 실제 식별자
   (주유소 UNI_ID, EV stat_id, 세차장 mgmt_no)는 모두 영숫자와 `._-` 안에 들어간다:

```ts
  // PostgREST or() 는 문자열 문법이라 경로값을 그대로 보간하면 필터가 깨진다.
  const ID_OK = /^[A-Za-z0-9._-]{1,64}$/;
  if (!ID_OK.test(params.id)) {
    return NextResponse.json({ error: 'invalid place id' }, { status: 400 });
  }
```

5. 조회 필터를 `.eq('station_id', params.id)` 에서 아래로:

```ts
    .or(`target_id.eq.${params.id},and(target_id.is.null,station_id.eq.${params.id})`)
    .eq('target_type', targetType)
```

> 이 `or` 는 SQL 의 `coalesce(target_id, station_id) = id` 와 같은 뜻이다. 전환기에 `target_id` 가
> 비어 있는 구행(주유소)도 함께 잡기 위해 필요하다.

6. 매핑에서 `stationId: r.station_id` 를 `targetType: r.target_type, targetId: r.target_id ?? r.station_id` 로.
7. select 목록에 `target_type, target_id, station_id` 를 추가한다.

- [ ] **Step 3: 통합 라우트 — 컬럼 부재 graceful degrade**

같은 파일의 GET 에서, 위 쿼리가 실패하면(마이그레이션 미적용 → `target_type` 컬럼 없음) 기존 경로로 한 번 더 시도한다:

```ts
  if (error) {
    // 0040 미적용 환경: target_type/target_id 컬럼이 없다. gas 는 기존 station_id 경로로 폴백하고,
    // ev/carwash 는 아직 저장할 수 없으므로 빈 목록을 준다(화면이 깨지지 않게).
    if (targetType !== 'gas') {
      return NextResponse.json({ reviews: [], stats: emptyStats() });
    }
    const legacy = await sb
      .from('reviews')
      .select(LEGACY_SELECT)
      .eq('station_id', params.id)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(100);
    if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 });
    rows = legacy.data;
  }
```

`LEGACY_SELECT` 는 기존 select 문자열에서 `target_type, target_id` 를 뺀 것이고, `emptyStats()` 는
`{ count: 0, average: 0, distribution: { 1:0, 2:0, 3:0, 4:0, 5:0 } }` 를 돌려주는 파일 내 헬퍼다.

- [ ] **Step 4: 통합 라우트 — POST**

지오펜스 블록에서 `stations` 직접 조회를 헬퍼로 교체한다:

```ts
    const target = await resolvePlaceTarget(sb, targetType, params.id);
    if (!target.exists) {
      return NextResponse.json({ error: 'place not found' }, { status: 404 });
    }
    if (target.lat != null && target.lng != null) {
      const dist = distanceMeters(lat, lng, target.lat, target.lng);
      const allowed =
        REVIEW_GEOFENCE_M +
        Math.min(typeof accuracy === 'number' && accuracy > 0 ? accuracy : 0, REVIEW_GEOFENCE_ACCURACY_CAP_M);
      if (dist > allowed) {
        return NextResponse.json(
          { error: 'too far from place', code: 'too_far', distanceM: Math.round(dist), allowedM: Math.round(allowed) },
          { status: 403 },
        );
      }
    }
```

insert payload 는 아래 규칙을 따른다 — **`gas` 는 두 컬럼을 모두 쓴다**:

```ts
  const payload: Record<string, unknown> = {
    user_id: userId,
    target_type: targetType,
    target_id: params.id,
    rating: body.rating,
    content,
    photo_paths: photoPaths,
    // 전환기 호환: 구버전 코드가 station_id 로 조회하므로 gas 는 둘 다 채운다.
    // 안 채우면 아직 배포되지 않은/브라우저에 떠 있는 구버전이 새 리뷰를 못 본다.
    ...(targetType === 'gas' ? { station_id: params.id } : {}),
  };
```

upsert 는 기존 코드의 충돌 처리 방식을 그대로 따른다(사용자당 대상당 1개 → 수정 허용).

- [ ] **Step 5: 기존 라우트를 위임으로 축소**

Modify `app/api/stations/[id]/reviews/route.ts` — 파일 전체를 아래로 교체:

**핸들러 본체는 `lib/api/place-reviews.ts` 로 뺀다.** 라우트 모듈이 다른 라우트 모듈을 import 하는 것은
Next 에서 보장된 동작이 아니므로, 두 라우트가 공통 함수를 부르는 형태로 만든다.

Create `lib/api/place-reviews.ts` — Step 2~4에서 작성한 GET/POST 본체를 그대로 옮기고 아래 시그니처로
export 한다:

```ts
export async function listPlaceReviews(req: Request, type: PlaceType, id: string): Promise<Response>
export async function createPlaceReview(req: Request, type: PlaceType, id: string): Promise<Response>
```

`app/api/places/[type]/[id]/reviews/route.ts` 는 종류 검증 후 이 함수들을 부른다.

Modify `app/api/stations/[id]/reviews/route.ts` — 파일 전체를 아래로 교체:

```ts
// 주유소 리뷰 — 공통 핸들러(lib/api/place-reviews.ts)를 gas 로 호출하는 얇은 껍데기.
//
// 지우지 않는 이유는 배포 순서다. 새 코드가 배포된 직후에도 브라우저에 떠 있는 구버전 페이지가
// 이 경로로 GET/POST 를 보낸다. 남겨두면 그 창에서 리뷰 조회·작성이 실패하지 않는다.
// 소비자가 모두 새 경로로 옮겨간 뒤 제거한다.
import { listPlaceReviews, createPlaceReview } from '@/lib/api/place-reviews';

export const runtime = 'nodejs';
export const revalidate = 30;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return listPlaceReviews(req, 'gas', params.id);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return createPlaceReview(req, 'gas', params.id);
}
```

- [ ] **Step 6: 게이트 + 동작 확인**

```bash
npm run typecheck && npm run lint && npm run build
```

그다음 dev 서버로 세 종류를 확인한다(실 DB 필요). 마이그레이션 **미적용** 상태에서 먼저:

```bash
npx next dev -p 3510 &
sleep 20
# gas 는 기존대로 동작해야 한다
curl -s "http://localhost:3510/api/places/gas/<실제주유소ID>/reviews" | head -c 200
# ev/carwash 는 빈 목록 + 200 (500 이 나오면 graceful degrade 실패)
curl -s -o /dev/null -w "ev %{http_code}\n"      "http://localhost:3510/api/places/ev/<실제statId>/reviews"
curl -s -o /dev/null -w "carwash %{http_code}\n" "http://localhost:3510/api/places/carwash/<실제mgmtNo>/reviews"
# 잘못된 종류는 400
curl -s -o /dev/null -w "bogus %{http_code}\n"   "http://localhost:3510/api/places/hotel/x/reviews"
# 필터 문법을 깨는 id 는 400 (R2)
curl -s -o /dev/null -w "badid %{http_code}\n"   "http://localhost:3510/api/places/gas/a,b(c)/reviews"
# 기존 경로 위임이 살아 있는지
curl -s -o /dev/null -w "legacy %{http_code}\n"  "http://localhost:3510/api/stations/<실제주유소ID>/reviews"
```

Expected: gas 200(기존과 같은 JSON), ev/carwash 200 + `{"reviews":[],...}`, bogus 400, legacy 200.

- [ ] **Step 7: 커밋**

```bash
git add app/api/places lib/mock/reviews.ts "app/api/stations/[id]/reviews/route.ts"
git commit -m "feat(reviews): 장소 공통 리뷰 API + 기존 라우트 위임

- /api/places/[type]/[id]/reviews 신설. 조회는 coalesce(target_id, station_id) 의미의 or 필터로
  전환기 구행까지 함께 잡는다.
- gas 작성 시 station_id 와 target_id 를 모두 채운다 — 하나만 채우면 아직 배포되지 않았거나
  브라우저에 떠 있는 구버전이 새 리뷰를 못 봐서 사용자에겐 리뷰가 사라진 것처럼 보인다.
- 0040 미적용 환경 폴백: gas 는 기존 station_id 경로, ev/carwash 는 빈 목록 200(화면 미파손).
- 기존 /api/stations/[id]/reviews 는 위임 껍데기로 남긴다(배포 순서 때문)."
```

---

## Task 3: 컴포넌트 일반화 + 카탈로그 키 이동

**Files:**
- Modify: `components/reviews/ReviewSection.tsx`, `ReviewForm.tsx`, `ReviewList.tsx`, `app/(intl)/station/[id]/page.tsx`, `messages/{ko,en,zh,ja}.json`

**Interfaces:**
- Produces: `<ReviewSection targetType={PlaceType} targetId={string} lat={number|undefined} lng={number|undefined} />`

- [ ] **Step 1: props 일반화**

Modify `components/reviews/ReviewSection.tsx` — `interface Props` 를 교체하고 내부 사용처를 따라 고친다:

```tsx
interface Props {
  targetType: PlaceType;
  targetId: string;
  lat?: number;
  lng?: number;
}

export function ReviewSection({ targetType, targetId, lat, lng }: Props) {
```

fetch URL 을 `/api/places/${targetType}/${targetId}/reviews` 로 바꾼다.
`ReviewForm` 에도 같은 4개 props 를 넘긴다.

Modify `components/reviews/ReviewForm.tsx` — `stationId/stationLat/stationLng` 를 위 이름으로 바꾸고, 거리 계산의 `stationLat/stationLng` 참조를 `lat/lng` 로 바꾼다. POST URL 도 동일하게 교체한다.

- [ ] **Step 2: 카탈로그 키 이동**

`messages/{ko,en,zh,ja}.json` 4개 파일에서 `station.review` 블록을 최상위 `review` 로 옮긴다. **값은 그대로 옮긴다(한국어 바이트 동일).** 컴포넌트의 `useTranslations('station.review')` 를 `useTranslations('review')` 로 바꾼다.

이동 후 남은 `station` 네임스페이스에 `review` 키가 없어야 한다.

- [ ] **Step 3: 종류별 문구 추가**

`messages/*.json` 의 새 `review` 블록에 아래 키를 추가한다(4개 로케일 전부). ko:

```json
"emptyState": "{type, select, gas {아직 이 주유소 리뷰가 없어요} ev {아직 이 충전소 리뷰가 없어요} carwash {아직 이 세차장 리뷰가 없어요} other {아직 이 장소의 리뷰가 없어요}}",
"writeCta": "{type, select, gas {이 주유소 리뷰 쓰기} ev {이 충전소 리뷰 쓰기} carwash {이 세차장 리뷰 쓰기} other {리뷰 쓰기}}",
"tooFarPlace": "{type, select, gas {주유소} ev {충전소} carwash {세차장} other {장소}} 근처에서만 리뷰를 쓸 수 있어요 (현재 {distance})"
```

en:

```json
"emptyState": "{type, select, gas {No reviews for this gas station yet} ev {No reviews for this charging station yet} carwash {No reviews for this car wash yet} other {No reviews for this place yet}}",
"writeCta": "{type, select, gas {Write a review} ev {Write a review} carwash {Write a review} other {Write a review}}",
"tooFarPlace": "You can only write a review near the {type, select, gas {gas station} ev {charging station} carwash {car wash} other {place}} (currently {distance})"
```

zh/ja 도 같은 키 구조로 채운다. 컴포넌트에서 `t('emptyState', { type: targetType })` 형태로 호출한다.

- [ ] **Step 4: 호출부 갱신**

Modify `app/(intl)/station/[id]/page.tsx:125` — 기존 호출을 교체:

```tsx
<ReviewSection targetType="gas" targetId={detail.id} lat={detail.lat} lng={detail.lng} />
```

- [ ] **Step 5: 게이트**

```bash
npm run i18n:check && npm run i18n:scan && npm run typecheck && npm run lint && npm run build
```

Expected: 전부 통과, `i18n:scan` 0. `i18n:check` 는 4개 로케일 키 수가 같아야 통과하므로 이동 중 누락이 여기서 잡힌다.

- [ ] **Step 6: 한국어 회귀 확인**

주유소 상세를 dev 서버에서 ko 로 열어 리뷰 영역 문구가 **변경 전과 동일한지** 확인한다. 변경 전 값은 `git show HEAD~1:messages/ko.json` 에서 `station.review` 블록으로 대조한다. 문구가 하나라도 달라지면 회귀다.

- [ ] **Step 7: 커밋**

```bash
git add components/reviews messages "app/(intl)/station/[id]/page.tsx"
git commit -m "refactor(reviews): 컴포넌트를 장소 종류 중립으로 일반화 + 카탈로그 키 이동

- ReviewSection/ReviewForm props 를 (targetType, targetId, lat, lng) 로. EV·세차장에서 그대로 재사용한다.
- station.review.* → review.* 이동. 세차장 화면이 station.review.submit 을 부르면 동작은 하지만
  키 이름이 사실과 달라진다. 한국어 값은 바이트 동일하게 옮겼다.
- 종류별로 달라야 하는 문구는 ICU select 로 한 키에 담는다 — 키를 세 벌로 늘리면 나중에 문구를
  고칠 때 한 군데를 놓친다."
```

---

## Task 4: EV · 세차장 상세에 리뷰 섹션 배치

**Files:**
- Modify: `app/(intl)/ev/[statId]/page.tsx`, `app/(intl)/carwash/[id]/page.tsx`

- [ ] **Step 1: EV 상세에 추가**

Modify `app/(intl)/ev/[statId]/page.tsx` — 주유소 상세와 **같은 위치**(부가 정보 아래, CTA 위)에 넣는다:

```tsx
import { ReviewSection } from '@/components/reviews/ReviewSection';
...
<ReviewSection targetType="ev" targetId={params.statId} lat={detail.lat} lng={detail.lng} />
```

`detail` 객체의 좌표 필드명이 다르면 그 이름을 쓴다(EV 상세는 `queryEvStationDetail` 결과를 쓴다).

- [ ] **Step 2: 세차장 상세에 추가**

Modify `app/(intl)/carwash/[id]/page.tsx` — 동일하게:

```tsx
<ReviewSection targetType="carwash" targetId={id} lat={place.lat} lng={place.lng} />
```

- [ ] **Step 3: 게이트 + 4로케일 렌더 확인**

```bash
npm run i18n:check && npm run i18n:scan && npm run typecheck && npm run lint && npm run build
npx next start -p 3511 &
sleep 8
for L in ko en zh ja; do
  echo "[$L] $(curl -s -b "NEXT_LOCALE=$L" "http://localhost:3511/ev/<실제statId>" | grep -oE '리뷰|Reviews|评价|レビュー' | head -1)"
done
```

Expected: 각 로케일에서 해당 언어의 리뷰 제목이 나온다. 세차장도 동일하게 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add "app/(intl)/ev" "app/(intl)/carwash"
git commit -m "feat(reviews): EV 충전소·세차장 상세에 리뷰 섹션 추가

주유소와 같은 위치에 배치한다. 지오펜스도 세 종류 모두 적용된다 — 두 테이블 다 좌표가 있고,
진위 확보라는 이유가 장소 종류와 무관하다. 한 종류만 빼면 그쪽으로 스팸이 몰린다."
```

---

## Task 5: 신고 스키마 + 접수 API + 개인 숨김

**Files:**
- Create: `supabase/migrations/0041_review_reports.sql`, `app/api/reviews/[id]/report/route.ts`
- Modify: `types/review.ts`, `app/api/places/[type]/[id]/reviews/route.ts`

**Interfaces:**
- Produces: `type ReportReason = 'spam' | 'abuse' | 'irrelevant' | 'false_info' | 'other'`, `POST /api/reviews/[id]/report`

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/0041_review_reports.sql`:

```sql
-- 1000냥 주유소 - 리뷰 신고
-- 운영자가 Supabase SQL Editor 에서 수동 적용한다.
--
-- 동작: 신고 즉시 신고자에게만 그 리뷰가 숨겨진다(개인 숨김). 전역 숨김(reviews.is_hidden)은
--   운영자가 /admin/reviews 에서 판단한다. **자동 전역 숨김은 하지 않는다** — 이 앱은 리뷰가
--   업주 이해관계(가격·품질 평가)와 직결돼 불리한 리뷰를 조직적으로 내릴 동기가 강하고,
--   억울하게 숨겨진 리뷰의 작성자에게는 항의 창구가 없다.
--
-- reviews 와 달리 여기는 외래키를 건다: 대상이 reviews 하나로 확정되고, 리뷰가 지워지면
--   그 신고는 의미가 없으므로 cascade 가 정확한 동작이다.

create table if not exists review_reports (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references reviews(id) on delete cascade,
  user_id     uuid not null references users(id)   on delete cascade,
  reason      text not null check (reason in ('spam','abuse','irrelevant','false_info','other')),
  detail      text check (char_length(detail) <= 200),
  resolved_at timestamptz,                  -- 운영자 처리 시각. null = 대기 중
  created_at  timestamptz default now()
);

-- 한 사용자가 같은 리뷰를 여러 번 신고해도 1건
create unique index if not exists review_reports_user_review_unique
  on review_reports (review_id, user_id);

-- 운영자 대기열
create index if not exists review_reports_open_idx
  on review_reports (created_at desc) where resolved_at is null;

-- 개인 숨김 조회용
create index if not exists review_reports_user_idx
  on review_reports (user_id, review_id);

alter table review_reports disable row level security;
```

- [ ] **Step 2: 타입 추가**

Modify `types/review.ts` — 파일 끝에 추가:

```ts
/** 신고 사유. DB check 제약과 1:1. */
export type ReportReason = 'spam' | 'abuse' | 'irrelevant' | 'false_info' | 'other';

export const REPORT_REASONS: readonly ReportReason[] = [
  'spam', 'abuse', 'irrelevant', 'false_info', 'other',
] as const;

export function isReportReason(v: string | undefined | null): v is ReportReason {
  return !!v && (REPORT_REASONS as readonly string[]).includes(v);
}

export const REPORT_DETAIL_MAX = 200;
```

- [ ] **Step 3: 신고 접수 라우트**

Create `app/api/reviews/[id]/report/route.ts`:

```ts
// 리뷰 신고 접수. 로그인 필수, 본인 리뷰는 신고 불가, 사용자당 리뷰당 1건.
// 접수 즉시 그 리뷰는 **신고자에게만** 보이지 않는다(개인 숨김은 이 행에서 파생되므로 별도 저장 없음).
// 전역 숨김은 운영자가 /admin/reviews 에서 판단한다 — 자동 숨김은 악용 경로가 되어 만들지 않는다.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { isReportReason, REPORT_DETAIL_MAX } from '@/types/review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json()) as { reason?: string; detail?: string };
  if (!isReportReason(body.reason)) {
    return NextResponse.json({ error: 'invalid reason' }, { status: 400 });
  }
  const detail = (body.detail ?? '').trim().slice(0, REPORT_DETAIL_MAX);

  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, mock: true });

  const sb = getSupabase();

  // 본인 리뷰 신고 차단 — 자기 글을 자기 화면에서 숨기는 용도로 쓰이면 신고 데이터가 오염된다.
  const { data: rev } = await sb.from('reviews').select('user_id').eq('id', params.id).maybeSingle();
  if (!rev) return NextResponse.json({ error: 'review not found' }, { status: 404 });
  if (rev.user_id === userId) {
    return NextResponse.json({ error: 'cannot report own review' }, { status: 400 });
  }

  const { error } = await sb
    .from('review_reports')
    .upsert(
      { review_id: params.id, user_id: userId, reason: body.reason, detail: detail || null },
      { onConflict: 'review_id,user_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: 개인 숨김을 목록 조회에 반영**

Modify `app/api/places/[type]/[id]/reviews/route.ts` 의 GET — 행을 매핑하기 **전에** 신고한 리뷰를 걸러낸다:

```ts
  // 개인 숨김: 로그인 사용자가 신고한 리뷰는 그 사용자에게 보이지 않는다.
  // review_reports 테이블 부재(0041 미적용)면 조용히 건너뛴다.
  let reportedIds = new Set<string>();
  if (myUserId) {
    const { data: reps } = await sb
      .from('review_reports')
      .select('review_id')
      .eq('user_id', myUserId);
    if (reps) reportedIds = new Set(reps.map((r) => r.review_id as string));
  }
```

그리고 매핑 결과에 `.filter((r) => !reportedIds.has(r.id))` 를 적용한다.
**통계(`stats`)는 필터 전 목록으로 계산한다** — 개인 숨김은 표시 문제이지 평점 왜곡 수단이 아니다.

- [ ] **Step 5: 게이트 + 동작 확인**

```bash
npm run typecheck && npm run lint && npm run build
```

dev 서버에서: 로그인 후 남의 리뷰를 신고 → 목록 재조회 시 그 리뷰가 **사라지는지**, 다른 계정/비로그인에서는 **그대로 보이는지**, 같은 리뷰를 다시 신고해도 오류 없이 1건인지, 본인 리뷰 신고가 400 인지 확인한다. 결과를 리포트에 붙인다.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0041_review_reports.sql app/api/reviews types/review.ts app/api/places
git commit -m "feat(reviews): 신고 접수 + 신고자 개인 숨김

신고 즉시 신고자에게만 그 리뷰가 사라진다 — 가장 불쾌한 당사자가 즉각 해결을 얻으면서
다른 사용자에겐 영향이 없다. 개인 숨김은 신고 행에서 파생되므로 별도 저장이 없다.

자동 전역 숨김은 만들지 않는다. 이 앱은 리뷰가 업주 이해관계와 직결돼 불리한 리뷰를 조직적으로
내릴 동기가 강하고, 억울하게 숨겨진 리뷰의 작성자에겐 항의 창구가 없다.

통계는 개인 숨김 필터 전 목록으로 계산한다 — 신고가 평점을 흔드는 수단이 되면 안 된다."
```

---

## Task 6: 신고 UI

**Files:**
- Create: `components/reviews/ReportButton.tsx`
- Modify: `components/reviews/ReviewList.tsx`, `messages/{ko,en,zh,ja}.json`

- [ ] **Step 1: 신고 버튼 + 사유 모달**

Create `components/reviews/ReportButton.tsx` — 리뷰 카드 우측 상단에 작은 "신고" 버튼, 누르면 사유 5개 라디오 + 상세 입력(선택, 200자) + 제출.

제출 성공 시 **왜 리뷰가 사라지는지 알리는 안내**를 띄운다. 이게 없으면 사용자는 리뷰가 삭제된 것으로 오해한다:

```tsx
      setDone(true);           // "신고했습니다. 이 리뷰는 회원님께 더 이상 표시되지 않습니다"
      onReported(reviewId);    // 부모가 목록에서 제거
```

`aria-label`·모달 제목·버튼 라벨을 모두 `t()` 로 처리한다.

- [ ] **Step 2: 목록에 연결**

Modify `components/reviews/ReviewList.tsx` — 각 카드에 `<ReportButton />` 을 넣되 **본인 리뷰(`r.isMine`)에는 렌더하지 않는다**. 비로그인 사용자에게는 버튼을 숨긴다(누르면 401이라 UX가 나쁘다).

- [ ] **Step 3: 문구 4개 로케일**

`messages/*.json` 의 `review` 블록에 추가한다(ko 예시, 나머지 3개도 같은 키):

```json
"report": {
  "action": "신고",
  "ariaLabel": "이 리뷰 신고하기",
  "title": "이 리뷰를 신고할까요?",
  "reasonSpam": "광고·스팸",
  "reasonAbuse": "욕설·비방",
  "reasonIrrelevant": "장소와 무관한 내용",
  "reasonFalseInfo": "허위 정보",
  "reasonOther": "기타",
  "detailPlaceholder": "자세한 내용 (선택, 200자)",
  "submit": "신고하기",
  "cancel": "취소",
  "done": "신고했습니다. 이 리뷰는 회원님께 더 이상 표시되지 않습니다.",
  "failed": "신고에 실패했어요. 잠시 후 다시 시도해 주세요."
}
```

- [ ] **Step 4: 게이트**

```bash
npm run i18n:check && npm run i18n:scan && npm run typecheck && npm run lint && npm run build
```

Expected: `i18n:scan` 0. 새 문구를 하드코딩했다면 여기서 잡힌다.

- [ ] **Step 5: 4로케일 화면 확인**

dev 서버에서 각 로케일로 리뷰가 있는 상세 페이지를 열어 신고 버튼·모달 문구가 해당 언어인지, 신고 후 안내가 뜨고 목록에서 사라지는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add components/reviews messages
git commit -m "feat(reviews): 신고 UI + 사유 선택

신고 직후 그 리뷰가 목록에서 사라지므로 왜 사라졌는지 알리는 안내를 반드시 띄운다 —
안 그러면 사용자는 리뷰가 삭제된 것으로 오해한다.

본인 리뷰와 비로그인 상태에서는 버튼을 렌더하지 않는다(누르면 401 이라 UX 가 나쁘다)."
```

---

## Task 7: 운영자 모더레이션 화면

**Files:**
- Create: `app/admin/reviews/page.tsx`, `app/admin/reviews/ReviewsAdminClient.tsx`, `app/api/admin/reviews/reports/route.ts`, `app/api/admin/reviews/[id]/route.ts`, `app/api/admin/reviews/reports/[id]/dismiss/route.ts`
- Modify: `app/admin/page.tsx`(도구 허브에 링크 추가)

> **`/admin` 은 다국어 대상이 아니다.** 한국어로 만든다. `i18n:scan` 의 EXCLUDE 에 이미 `components/admin/` 이 있고 `app/admin/` 은 `app/(intl)` 밖이라 스캔 범위 밖이다.

- [ ] **Step 1: 관리자 API 3종**

Create `app/api/admin/reviews/reports/route.ts` — 미처리 신고를 리뷰 단위로 묶어 반환. 가드는 기존 패턴을 그대로 쓴다:

```ts
async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (session?.revoked) return false;
  return isAdminEmail(session?.user?.email);
}
```

미인증/비관리자는 **404**로 응답한다(존재 비노출 — 기존 `app/api/admin/notice/route.ts` 관례).

Create `app/api/admin/reviews/[id]/route.ts` — `PATCH { hidden: boolean }` 로 `reviews.is_hidden` 을 설정하고, 그 리뷰의 미처리 신고에 `resolved_at = now()` 를 찍는다.

Create `app/api/admin/reviews/reports/[id]/dismiss/route.ts` — `POST` 로 해당 신고 1건만 `resolved_at` 을 찍는다(리뷰는 그대로).

- [ ] **Step 2: 화면**

Create `app/admin/reviews/page.tsx` — 기존 `app/admin/notice/page.tsx` 패턴 그대로:

```tsx
export const metadata: Metadata = {
  title: '리뷰 신고 관리 (운영)',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function ReviewsAdminPage() {
  if (!(await getAdminOrNull())) notFound();
  return <ReviewsAdminClient />;
}
```

Create `app/admin/reviews/ReviewsAdminClient.tsx` — 미처리 신고를 리뷰 단위로 카드 나열. 각 카드에 리뷰 본문·사진·별점·장소(종류+ID), 신고 건수, 사유 목록, 신고자, 그리고 **[숨김] [기각]** 버튼. 이미 숨긴 리뷰는 **[숨김 해제]**.

**신고자를 화면에 표시하는 이유**는 조직적 신고 식별이다. 같은 사용자들이 특정 장소의 리뷰만 반복 신고하는 패턴은 눈에 보여야 판단할 수 있다.

- [ ] **Step 3: 도구 허브에 링크**

Modify `app/admin/page.tsx` — 도구 허브 링크 카드 정의(약 187줄)에 `/admin/reviews` 항목을 기존 형식대로 추가한다.

- [ ] **Step 4: 게이트 + 권한 확인**

```bash
npm run typecheck && npm run lint && npm run build && npm run i18n:scan
```

권한 확인(중요):

```bash
# 비로그인 → 404 (401 이 아니라 404 여야 한다: 존재 비노출)
curl -s -o /dev/null -w "anon api %{http_code}\n" http://localhost:3512/api/admin/reviews/reports
curl -s -o /dev/null -w "anon page %{http_code}\n" http://localhost:3512/admin/reviews
```

Expected: 둘 다 404. 관리자로 로그인한 세션에서는 200 이고 목록이 나온다.

- [ ] **Step 5: 커밋**

```bash
git add app/admin/reviews app/api/admin/reviews app/admin/page.tsx
git commit -m "feat(admin): 리뷰 신고 모더레이션 화면

이 작업의 핵심이다. is_hidden 컬럼은 있었지만 코드 전체에서 읽기만 하고 어디서도 쓰지 않아,
부적절한 리뷰를 내리려면 운영자가 Supabase SQL 편집기에서 직접 UPDATE 해야 했다.
신고를 받아도 처리할 화면이 없으면 아무 일도 일어나지 않는다.

신고자를 화면에 표시한다 — 같은 사용자들이 특정 장소 리뷰만 반복 신고하는 패턴은
보이지 않으면 사후에도 알 수 없다.

비관리자에게는 401 이 아니라 404 로 응답한다(존재 비노출, 기존 관리자 API 관례)."
```

---

## Task 8: 마무리 — 전수 검증 + 운영자 적용 안내

**Files:**
- Create: `docs/improvements/2026-08-18-place-reviews/qa-report.md`

- [ ] **Step 1: 전체 게이트**

```bash
npm run i18n:check && npm run i18n:scan && npm run typecheck && npm run lint && npm run build
```

Expected: 전부 exit 0, `i18n:scan` 0.

- [ ] **Step 2: `/regions` SSG 회귀 확인**

```bash
npm run build 2>&1 | grep -E "^├ ● /regions"
```

Expected: `● /regions/[region]` 과 `● /regions/[region]/[district]` 둘 다 존재. 이 프로젝트에서 반복적으로 깨질 뻔한 제약이므로 마지막에 반드시 확인한다.

- [ ] **Step 3: 마이그레이션 미적용 상태 검증 (가장 중요)**

**0040·0041 을 적용하지 않은 DB** 를 대상으로 앱을 띄우고 확인한다:

- 주유소 상세: 리뷰 목록·작성이 **기존과 동일하게** 동작
- EV·세차장 상세: 리뷰 섹션이 빈 목록으로 뜨고 **500 이 나지 않음**
- 신고 버튼: 눌러도 앱이 깨지지 않음(테이블 부재 → 조용한 실패 또는 실패 안내)

이 검증이 통과해야 "코드 먼저 배포" 순서가 안전하다.

- [ ] **Step 4: 4로케일 렌더 확인**

프로덕션 빌드에서 헤드리스 브라우저로 `NEXT_LOCALE` 쿠키를 바꿔가며(`Network.setCookie` 사용 — `setExtraHTTPHeaders` 의 Cookie 는 브라우저가 무시한다) 주유소·EV·세차장 상세를 en/zh/ja 로 열어 리뷰·신고 UI에 한국어가 남아 있지 않은지 확인한다. DB 원본(장소명·주소·리뷰 본문)은 한국어가 정상이다.

- [ ] **Step 5: QA 리포트 작성**

Create `docs/improvements/2026-08-18-place-reviews/qa-report.md` — 게이트 결과, 위 3·4단계 실측, 미확인 항목과 그 사유를 적는다.

- [ ] **Step 6: 운영자 후속 작업 문서화 + 커밋**

QA 리포트 말미에 운영자 작업을 순서대로 적는다:

1. `supabase/migrations/0040_reviews_polymorphic.sql` 적용 → 기존 주유소 리뷰가 그대로 보이는지 확인
2. `supabase/migrations/0041_review_reports.sql` 적용 → 신고 버튼 동작 확인
3. `ADMIN_EMAILS` 에 본인 이메일이 있는지 확인 → `/admin/reviews` 접근 확인
4. **신고 확인 주기를 정할 것** — 자동 전역 숨김이 없으므로 운영자가 보기 전까지 부적절한 내용이 다른 사용자에게 노출된다. 주기가 길어지면 웹푸시 알림(인프라 이미 있음)을 붙이는 것이 다음 수단이다.

```bash
git add docs/improvements/2026-08-18-place-reviews/qa-report.md
git commit -m "docs: 장소 리뷰 QA 리포트 + 운영자 적용 순서"
```

---

## Self-Review 결과

**명세 커버리지**

| 명세 항목 | 태스크 |
|---|---|
| 통합 테이블 / FK 없음 | Task 1 |
| 배포 순서 양방향 안전 | Task 1(default 'gas'), Task 2(폴백), Task 8 Step 3(검증) |
| `gas` 는 두 컬럼 모두 기록 | Task 2 Step 4 |
| `place_review_stats` 추가 / 기존 뷰 존치 | Task 1 |
| 통합 API + 기존 라우트 위임 | Task 2 |
| 대상 존재 검증(종류별) | Task 1 `resolvePlaceTarget` |
| 지오펜스 3종 적용 | Task 2 Step 4, Task 4 |
| 컴포넌트 일반화 | Task 3 |
| `station.review.*` → `review.*` | Task 3 Step 2 |
| ICU select 종류별 문구 | Task 3 Step 3 |
| EV·세차장 배치 | Task 4 |
| 신고 스키마 + 접수 | Task 5 |
| 개인 숨김 | Task 5 Step 4 |
| 자동 숨김 없음 | 전 태스크에서 구현하지 않음(명시) |
| 신고 UI + 안내 문구 | Task 6 |
| 운영자 모더레이션 화면 | Task 7 |
| 신고자 기록·표시 | Task 5(스키마), Task 7(화면) |
| 4로케일 + `i18n:scan` 0 | Task 3·6, Task 8 |

**미할당 없음.**

**타입 일관성** — `PlaceType`·`isPlaceType`·`PLACE_TYPES`(Task 1)가 Task 2·3·4에서 같은 이름으로 쓰인다. `resolvePlaceTarget(sb, type, id)`(Task 1)은 Task 2에서만 소비한다. `ReportReason`·`isReportReason`·`REPORT_DETAIL_MAX`(Task 5)는 Task 5·6에서 쓰인다. `ReviewSection` props 이름(`targetType`/`targetId`/`lat`/`lng`)은 Task 3에서 정의해 Task 4에서 그대로 쓴다.

**실행자가 착수 시 코드에서 확인할 것**
- `app/(intl)/ev/[statId]/page.tsx` 의 `detail` 객체 좌표 필드명(`lat`/`lng` 가 아닐 수 있다) — Task 4 Step 1.
- `app/api/stations/[id]/reviews/route.ts` 의 upsert 충돌 처리 방식 — Task 2 Step 4에서 그대로 따라야 한다.
- `lib/mock/reviews.ts` 시드 데이터의 기존 `stationId` 값 — Task 2 Step 1에서 `targetId` 로 옮긴다.
