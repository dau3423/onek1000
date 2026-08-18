// 장소(주유소/EV충전소/세차장) 공통 리뷰 목록 조회 + 작성 핸들러 본체.
//
// app/api/places/[type]/[id]/reviews/route.ts 와 app/api/stations/[id]/reviews/route.ts(위임 껍데기)가
// 함께 부른다. 라우트 모듈이 다른 라우트 모듈을 import 하는 것은 Next 에서 보장된 동작이 아니라서
// 공통 로직을 이 파일로 뺐다.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getSignedUrls } from '@/lib/storage/photos';
import { listMockReviews, appendMockReview } from '@/lib/mock/reviews';
import { resolvePlaceTarget } from '@/lib/places/target';
import type { Review, ReviewStats, CreateReviewInput, PlaceType } from '@/types/review';
import {
  REVIEW_CONTENT_MAX,
  REVIEW_PHOTO_MAX,
  REVIEW_GEOFENCE_M,
  REVIEW_GEOFENCE_ACCURACY_CAP_M,
} from '@/types/review';
import { distanceMeters } from '@/lib/map/geo';

// PostgREST or() 는 문자열 문법이라 경로값을 그대로 보간하면 필터가 깨진다. 세 종류의 실제
// 식별자(주유소 UNI_ID, EV stat_id, 세차장 mgmt_no)는 모두 영숫자와 ._- 안에 들어간다.
const ID_OK = /^[A-Za-z0-9._-]{1,64}$/;

// 0040 적용 후 select 목록 (target_type/target_id/station_id 포함)
const SELECT_FIELDS = `
  id, rating, content, photo_paths, created_at, updated_at,
  user_id, target_type, target_id, station_id,
  user:users!inner(id, nickname, name, image_url)
`;
// 0040 미적용 환경(target_type/target_id 컬럼 없음)용 폴백 select
const LEGACY_SELECT = `
  id, rating, content, photo_paths, created_at, updated_at,
  user_id,
  user:users!inner(id, nickname, name, image_url)
`;

function emptyStats(): ReviewStats {
  return { count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
}

// ─── GET: 장소의 리뷰 목록 + 통계 ───
export async function listPlaceReviews(_req: Request, targetType: PlaceType, id: string): Promise<Response> {
  const session = await getServerSession(authOptions);
  const myUserId = session?.user?.id;

  if (!isSupabaseConfigured()) {
    const reviews = listMockReviews(targetType, id).map((r) => ({
      ...r,
      isMine: r.user.id === myUserId,
    }));
    const stats = computeStats(reviews);
    return NextResponse.json({ reviews, stats });
  }

  if (!ID_OK.test(id)) {
    return NextResponse.json({ error: 'invalid place id' }, { status: 400 });
  }

  const sb = getSupabase();

  // coalesce(target_id, station_id) = id 와 같은 뜻. 전환기에 target_id 가 비어 있는
  // 구행(주유소)도 함께 잡기 위해 or() 를 쓴다.
  const primary = await sb
    .from('reviews')
    .select(SELECT_FIELDS)
    .or(`target_id.eq.${id},and(target_id.is.null,station_id.eq.${id})`)
    .eq('target_type', targetType)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(100);

  let rows: any[] | null;

  if (primary.error) {
    // 0040 미적용 환경: target_type/target_id 컬럼이 없다. gas 는 기존 station_id 경로로 폴백하고,
    // ev/carwash 는 아직 저장할 수 없으므로 빈 목록을 준다(화면이 깨지지 않게).
    if (targetType !== 'gas') {
      return NextResponse.json({ reviews: [], stats: emptyStats() });
    }
    const legacy = await sb
      .from('reviews')
      .select(LEGACY_SELECT)
      .eq('station_id', id)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(100);
    if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 });
    rows = legacy.data;
  } else {
    rows = primary.data;
  }

  // 모든 사진 경로를 모아 한 번에 서명 URL 발급
  const allPaths: string[] = [];
  for (const r of rows ?? []) allPaths.push(...((r as any).photo_paths ?? []));
  const allUrls = await getSignedUrls(allPaths);
  let cursor = 0;

  const reviews: Review[] = (rows ?? []).map((r: any) => {
    const paths: string[] = r.photo_paths ?? [];
    const urls = allUrls.slice(cursor, cursor + paths.length);
    cursor += paths.length;
    const user = Array.isArray(r.user) ? r.user[0] : r.user;
    // 구행(target_id 없음)은 station_id 로, 폴백 경로(select 자체에 없음)는 id 로 채운다.
    const resolvedId: string = r.target_id ?? r.station_id ?? id;
    return {
      id: r.id,
      stationId: resolvedId,
      targetType: (r.target_type as PlaceType | undefined) ?? targetType,
      targetId: resolvedId,
      user: {
        id: user?.id,
        nickname: user?.nickname ?? null,
        name: user?.name ?? null,
        imageUrl: user?.image_url ?? null,
      },
      rating: r.rating,
      content: r.content ?? '',
      photoUrls: urls,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      isMine: r.user_id === myUserId,
    };
  });

  // 통계: 두 종류 모두 view-first 다 — 목록은 .limit(100) 이 걸려 있어 rows 로 계산하면
  // 100건을 넘는 장소의 카운트/평균이 조용히 축소된다. gas 는 기존 station_review_stats 뷰
  // (0004, 항상 존재), ev/carwash 는 place_review_stats 뷰(0040)를 먼저 쓰고, 뷰가 없거나
  // (0040 미적용) 조회가 실패하는 경우에만 방금 가져온 목록으로 계산한다.
  let stats: ReviewStats;
  if (targetType === 'gas') {
    const { data: statsRow } = await sb
      .from('station_review_stats')
      .select('review_count, rating_avg, r1, r2, r3, r4, r5')
      .eq('station_id', id)
      .maybeSingle();
    stats = statsRow
      ? {
          count: statsRow.review_count,
          average: Number(statsRow.rating_avg) || 0,
          distribution: { 1: statsRow.r1, 2: statsRow.r2, 3: statsRow.r3, 4: statsRow.r4, 5: statsRow.r5 },
        }
      : computeStats(reviews);
  } else {
    const { data: statsRow, error: statsError } = await sb
      .from('place_review_stats')
      .select('review_count, rating_avg, r1, r2, r3, r4, r5')
      .eq('target_type', targetType)
      .eq('target_id', id)
      .maybeSingle();
    stats =
      !statsError && statsRow
        ? {
            count: statsRow.review_count,
            average: Number(statsRow.rating_avg) || 0,
            distribution: { 1: statsRow.r1, 2: statsRow.r2, 3: statsRow.r3, 4: statsRow.r4, 5: statsRow.r5 },
          }
        : computeStats(reviews);
  }

  // 개인 숨김: 로그인 사용자가 신고한 리뷰는 그 사용자에게 보이지 않는다.
  // review_reports 테이블 부재(0041 미적용)면 조용히 건너뛴다.
  // 통계(stats)는 이미 위에서 필터 전 목록으로 계산했다 — 신고가 평점을 흔드는 수단이 되면 안 된다.
  let reportedIds = new Set<string>();
  if (myUserId) {
    const { data: reps } = await sb
      .from('review_reports')
      .select('review_id')
      .eq('user_id', myUserId);
    if (reps) reportedIds = new Set(reps.map((r) => r.review_id as string));
  }

  return NextResponse.json({ reviews: reviews.filter((r) => !reportedIds.has(r.id)), stats });
}

// ─── POST: 리뷰 작성 ───
export async function createPlaceReview(req: Request, targetType: PlaceType, id: string): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!ID_OK.test(id)) {
    return NextResponse.json({ error: 'invalid place id' }, { status: 400 });
  }

  const body = (await req.json()) as Partial<CreateReviewInput>;
  if (!body.rating || body.rating < 1 || body.rating > 5) {
    return NextResponse.json({ error: 'rating(1-5) required' }, { status: 400 });
  }
  const content = (body.content ?? '').trim();
  if (content.length > REVIEW_CONTENT_MAX) {
    return NextResponse.json({ error: `content max ${REVIEW_CONTENT_MAX}` }, { status: 400 });
  }
  const photoPaths = Array.isArray(body.photoPaths) ? body.photoPaths.slice(0, REVIEW_PHOTO_MAX) : [];

  if (!isSupabaseConfigured()) {
    // mock: 즉시 메모리에 추가
    const review: Review = {
      id: `mock-rev-${Date.now()}`,
      stationId: id,
      targetType,
      targetId: id,
      user: {
        id: (session.user as any).id ?? 'mock-self',
        nickname: session.user.nickname ?? null,
        name: session.user.name ?? '나',
        imageUrl: session.user.image ?? null,
      },
      rating: body.rating,
      content,
      photoUrls: photoPaths.map(
        (p) => `https://placehold.co/600x400/FF6B00/white?text=${encodeURIComponent(p.slice(-12))}`,
      ),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isMine: true,
    };
    appendMockReview(review);
    return NextResponse.json({ ok: true, review });
  }

  const sb = getSupabase();

  // ─── 지오펜스: 해당 장소 근처에서만 작성 가능 ───
  // 클라가 보낸 현재 위치와 장소 좌표의 거리를 서버가 검증한다(클라 차단은 UX용, 여기가 권위).
  {
    const { lat, lng, accuracy } = body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'location required', code: 'location_required' }, { status: 400 });
    }
    const target = await resolvePlaceTarget(sb, targetType, id);
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
          {
            error: 'too far from place',
            code: 'too_far',
            distanceM: Math.round(dist),
            allowedM: Math.round(allowed),
          },
          { status: 403 },
        );
      }
    }
  }

  const { data: user } = await sb.from('users').select('id').eq('email', session.user.email).maybeSingle();
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const payload: Record<string, unknown> = {
    user_id: user.id,
    target_type: targetType,
    target_id: id,
    rating: body.rating,
    content,
    photo_paths: photoPaths,
    // 전환기 호환: 구버전 코드가 station_id 로 조회하므로 gas 는 둘 다 채운다.
    // 안 채우면 아직 배포되지 않은/브라우저에 떠 있는 구버전이 새 리뷰를 못 본다.
    ...(targetType === 'gas' ? { station_id: id } : {}),
  };

  // gas 는 0004 부터 있던 기존 유니크 인덱스(user_id, station_id)를 충돌 대상으로 삼는다 —
  // 이 인덱스는 0040 적용 여부와 무관하게 항상 존재해 배포 순서에 안전하다.
  // ev/carwash 는 station_id 가 없으므로 0040 이 추가하는 (user_id, target_type, target_id)
  // 인덱스가 있어야만 upsert 가 동작한다. 그 인덱스가 생기기 전에는 ev/carwash 리뷰 자체가
  // 아직 존재할 수 없었으므로(신기능) 이 순서 의존은 안전하다.
  const onConflict = targetType === 'gas' ? 'user_id,station_id' : 'user_id,target_type,target_id';

  const primary = await sb.from('reviews').upsert(payload, { onConflict }).select().single();

  if (primary.error) {
    // 0040 미적용 환경: target_type/target_id 컬럼이 없어 PostgREST 가 42703 을 던진다.
    // GET 과 똑같이 "쿼리가 에러나면 폴백" 방식으로 감지한다(별도 판별 로직을 두지 않는다) —
    // 이 라우트는 ReviewForm/ReviewSection 이 실제로 쓰는 현재 서비스 중인 쓰기 경로이므로
    // GET 만 폴백을 갖고 POST 가 500 을 내면 배포 순서 안전성 보장이 깨진다.
    if (targetType !== 'gas') {
      // ev/carwash 는 target_id 없이는 저장할 방법이 없다(station_id 로 대신 저장할 대상 자체가
      // 없다). 화면이 "아직 이용할 수 없음"을 보여줄 수 있도록 500 대신 503 + 코드로 구분한다.
      return NextResponse.json(
        {
          error: 'place review writes are not available until a pending migration is applied',
          code: 'migration_required',
        },
        { status: 503 },
      );
    }
    // gas: 구버전과 동일한 station_id 전용 payload/충돌 대상으로 재시도한다. target_id 없이
    // 저장되지만, 이는 GET 이 이미 처리하는 구행 모양과 정확히 같다(coalesce(target_id,
    // station_id) 로 계속 조회된다) — 마이그레이션 적용 후 별도 백필 없이도 자연히 맞아든다.
    const legacyPayload = {
      user_id: user.id,
      station_id: id,
      rating: body.rating,
      content,
      photo_paths: photoPaths,
    };
    const legacy = await sb
      .from('reviews')
      .upsert(legacyPayload, { onConflict: 'user_id,station_id' })
      .select()
      .single();
    if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, review: { id: legacy.data.id } });
  }

  return NextResponse.json({ ok: true, review: { id: primary.data.id } });
}

// ─── 통계 헬퍼 (mock / ev·carwash 용) ───
function computeStats(reviews: Review[]): ReviewStats {
  const dist: ReviewStats['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of reviews) {
    dist[r.rating]++;
    sum += r.rating;
  }
  return {
    count: reviews.length,
    average: reviews.length ? Math.round((sum / reviews.length) * 10) / 10 : 0,
    distribution: dist,
  };
}
