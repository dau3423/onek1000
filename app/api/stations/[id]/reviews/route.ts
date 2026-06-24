// 주유소 리뷰 목록 + 작성
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { getSignedUrls } from '@/lib/storage/photos';
import { listMockReviews, appendMockReview } from '@/lib/mock/reviews';
import type { Review, ReviewStats, CreateReviewInput } from '@/types/review';
import { REVIEW_CONTENT_MAX, REVIEW_PHOTO_MAX, REVIEW_GEOFENCE_M, REVIEW_GEOFENCE_ACCURACY_CAP_M } from '@/types/review';
import { distanceMeters } from '@/lib/map/geo';

export const runtime = 'nodejs';
export const revalidate = 30;

// ─── GET: 주유소의 리뷰 목록 + 통계 ───
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const myUserId = session?.user?.id;

  if (!isSupabaseConfigured()) {
    const reviews = listMockReviews(params.id).map((r) => ({
      ...r,
      isMine: r.user.id === myUserId,
    }));
    const stats = computeStats(reviews);
    return NextResponse.json({ reviews, stats });
  }

  const sb = getSupabase();

  const { data: rows, error } = await sb
    .from('reviews')
    .select(`
      id, rating, content, photo_paths, created_at, updated_at,
      user_id,
      user:users!inner(id, nickname, name, image_url)
    `)
    .eq('station_id', params.id)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
    return {
      id: r.id,
      stationId: params.id,
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

  const { data: statsRow } = await sb
    .from('station_review_stats')
    .select('review_count, rating_avg, r1, r2, r3, r4, r5')
    .eq('station_id', params.id)
    .maybeSingle();

  const stats: ReviewStats = statsRow
    ? {
        count: statsRow.review_count,
        average: Number(statsRow.rating_avg) || 0,
        distribution: { 1: statsRow.r1, 2: statsRow.r2, 3: statsRow.r3, 4: statsRow.r4, 5: statsRow.r5 },
      }
    : computeStats(reviews);

  return NextResponse.json({ reviews, stats });
}

// ─── POST: 리뷰 작성 ───
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

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
      stationId: params.id,
      user: {
        id: (session.user as any).id ?? 'mock-self',
        nickname: session.user.nickname ?? null,
        name: session.user.name ?? '나',
        imageUrl: session.user.image ?? null,
      },
      rating: body.rating,
      content,
      photoUrls: photoPaths.map((p) => `https://placehold.co/600x400/FF6B00/white?text=${encodeURIComponent(p.slice(-12))}`),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isMine: true,
    };
    appendMockReview(review);
    return NextResponse.json({ ok: true, review });
  }

  const sb = getSupabase();

  // ─── 지오펜스: 해당 주유소 근처에서만 작성 가능 ───
  // 클라가 보낸 현재 위치와 주유소 좌표의 거리를 서버가 검증한다(클라 차단은 UX용, 여기가 권위).
  // 주유소 좌표가 없으면(데이터 누락, 드묾) 검증 불가 → 정상 사용자를 막지 않도록 통과시킨다.
  {
    const { lat, lng, accuracy } = body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json(
        { error: 'location required', code: 'location_required' },
        { status: 400 },
      );
    }
    const { data: st } = await sb
      .from('stations')
      .select('lat, lng')
      .eq('id', params.id)
      .maybeSingle();
    if (st && typeof st.lat === 'number' && typeof st.lng === 'number') {
      const dist = distanceMeters(lat, lng, st.lat, st.lng);
      const allowed =
        REVIEW_GEOFENCE_M +
        Math.min(typeof accuracy === 'number' && accuracy > 0 ? accuracy : 0, REVIEW_GEOFENCE_ACCURACY_CAP_M);
      if (dist > allowed) {
        return NextResponse.json(
          {
            error: 'too far from station',
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

  const { data, error } = await sb
    .from('reviews')
    .upsert(
      {
        station_id: params.id,
        user_id: user.id,
        rating: body.rating,
        content,
        photo_paths: photoPaths,
      },
      { onConflict: 'user_id,station_id' },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, review: { id: data.id } });
}

// ─── 통계 헬퍼 (mock용) ───
function computeStats(reviews: Review[]): ReviewStats {
  const dist: ReviewStats['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of reviews) { dist[r.rating]++; sum += r.rating; }
  return {
    count: reviews.length,
    average: reviews.length ? Math.round((sum / reviews.length) * 10) / 10 : 0,
    distribution: dist,
  };
}
