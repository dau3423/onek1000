// 운영자 리뷰 모더레이션(/admin/reviews) 도메인 쿼리.
//
// is_hidden 컬럼(0004)은 있었지만 이 파일이 생기기 전까지 코드 전체에서 쓰는 곳이 없었다 —
// 즉 이 파일이 "전역 숨김"이 실제로 일어나는 유일한 경로다. 자동 숨김은 절대 하지 않는다:
// 리뷰는 업주 이해관계(가격·품질 평가)와 직결돼 불리한 리뷰를 조직적으로 신고할 동기가 있고,
// 억울하게 숨겨진 작성자에게는 항의 창구가 없다. 사람이 판단해서 숨긴다.
//
// review_reports(0041)는 운영자가 아직 수동 적용하지 않았을 수 있다 — 그 경우 목록 조회는
// PostgREST 에러(테이블/스키마 캐시 없음)로 실패한다. 여기서는 그 실패를 조용히 "대기열 0건"으로
// 바꾼다(500이나 화면 크래시 대신). 숨김 리뷰 목록은 review_reports 와 무관하게(reviews.is_hidden
// 만 보고) 조회하므로, 마이그레이션 적용 전에도 과거에 수동으로 숨긴 리뷰의 숨김 해제는 계속 된다.

import { getSupabase, isSupabaseConfigured } from './supabase';
import { getSignedUrls } from '@/lib/storage/photos';
import type { PlaceType } from '@/types/review';
import type {
  AdminQueueItem,
  AdminReportItem,
  AdminReviewPerson,
  AdminReviewSummary,
  ModerationQueue,
} from '@/types/admin-review';

type Row = any;

const REVIEW_FIELDS = `
  id, rating, content, photo_paths, is_hidden, target_type, target_id, station_id, created_at,
  author:users!inner(id, nickname, name, email)
`;

const HIDDEN_LIST_LIMIT = 50;
const PENDING_REPORTS_LIMIT = 500;

function toPerson(u: Row): AdminReviewPerson {
  const row = Array.isArray(u) ? u[0] : u;
  return {
    id: row?.id ?? '',
    nickname: row?.nickname ?? null,
    name: row?.name ?? null,
    email: row?.email ?? null,
  };
}

async function toSummaries(rows: Row[]): Promise<AdminReviewSummary[]> {
  const allPaths: string[] = [];
  for (const r of rows) allPaths.push(...((r.photo_paths as string[] | null) ?? []));
  const allUrls = await getSignedUrls(allPaths);
  let cursor = 0;
  return rows.map((r) => {
    const paths: string[] = r.photo_paths ?? [];
    const photoUrls = allUrls.slice(cursor, cursor + paths.length);
    cursor += paths.length;
    return {
      id: r.id,
      rating: r.rating,
      content: r.content ?? '',
      photoUrls,
      isHidden: Boolean(r.is_hidden),
      targetType: (r.target_type as PlaceType | undefined) ?? 'gas',
      targetId: r.target_id ?? r.station_id ?? null,
      createdAt: r.created_at,
      author: toPerson(r.author),
    };
  });
}

function emptyQueue(reportsTableMissing: boolean, hidden: AdminReviewSummary[] = []): ModerationQueue {
  return { pending: [], hidden, reportsTableMissing };
}

/** 대기열 전체 — 미처리 신고(리뷰 단위 묶음) + 현재 숨김 리뷰 목록. */
export async function getModerationQueue(): Promise<ModerationQueue> {
  if (!isSupabaseConfigured()) return emptyQueue(false);
  const sb = getSupabase();

  // 1) 현재 숨김 리뷰 — 신고 유무와 무관(수동 숨김 포함), 숨김 해제 대상.
  const { data: hiddenRows, error: hiddenError } = await sb
    .from('reviews')
    .select(REVIEW_FIELDS)
    .eq('is_hidden', true)
    .order('updated_at', { ascending: false })
    .limit(HIDDEN_LIST_LIMIT);
  const hidden = hiddenError ? [] : await toSummaries(hiddenRows ?? []);

  // 2) 미처리 신고 — 리뷰 단위로 묶는다.
  const { data: reportRows, error: reportsError } = await sb
    .from('review_reports')
    .select(
      `id, review_id, reason, detail, created_at,
       reporter:users!inner(id, nickname, name, email),
       review:reviews!inner(${REVIEW_FIELDS})`,
    )
    .is('resolved_at', null)
    .order('created_at', { ascending: true })
    .limit(PENDING_REPORTS_LIMIT);

  if (reportsError) {
    // 0041 미적용 등 — 대기열만 비우고 화면은 정상 렌더(숨김 목록은 위에서 이미 구했다).
    return emptyQueue(true, hidden);
  }

  const byReview = new Map<string, { review: Row; reports: Row[] }>();
  for (const r of reportRows ?? []) {
    const review = Array.isArray(r.review) ? r.review[0] : r.review;
    if (!review) continue; // 리뷰가 삭제됐는데 신고 행만 남은 경우(정상적으로는 cascade로 없음) 방어.
    if (review.is_hidden) continue; // 이미 숨긴 리뷰는 hidden 목록에서 다룬다(중복 노출 방지).
    const g = byReview.get(review.id) ?? { review, reports: [] as Row[] };
    g.reports.push(r);
    byReview.set(review.id, g);
  }

  const groups = Array.from(byReview.values());
  const reviewSummaries = await toSummaries(groups.map((g) => g.review));
  const pending: AdminQueueItem[] = groups
    .map((g, i) => ({
      review: reviewSummaries[i],
      reports: g.reports.map(
        (rep): AdminReportItem => ({
          id: rep.id,
          reason: rep.reason,
          detail: rep.detail ?? null,
          createdAt: rep.created_at,
          reporter: toPerson(rep.reporter),
        }),
      ),
    }))
    // 신고 건수가 많은 순 — 조직적 신고(같은 장소에 신고 몰림) 패턴이 위로 오게.
    .sort((a, b) => b.reports.length - a.reports.length);

  return { pending, hidden, reportsTableMissing: false };
}

interface MutationResult {
  ok: boolean;
  notFound?: boolean;
  error?: string;
}

/**
 * 리뷰 전역 숨김/해제.
 * 숨길 때는(hidden=true) 그 리뷰의 미처리 신고를 함께 처리 완료로 찍는다 — 안 그러면 운영자가
 * 방금 숨긴 리뷰를 대기열에서 또 보게 된다. review_reports 미존재 환경에서는 조용히 건너뛴다
 * (리뷰 숨김 자체는 review_reports 와 무관하게 항상 동작해야 한다).
 * 두 번 눌러도(멱등) update 자체가 조건 없이 값만 덮어써서 안전하다.
 */
export async function setReviewHidden(id: string, hidden: boolean): Promise<MutationResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'not configured' };
  const sb = getSupabase();

  const { data, error } = await sb
    .from('reviews')
    .update({ is_hidden: hidden })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, notFound: true };

  if (hidden) {
    // best-effort: review_reports 가 없으면(0041 미적용) 에러를 무시한다 — 숨김 자체는 이미 끝났다.
    await sb
      .from('review_reports')
      .update({ resolved_at: new Date().toISOString() })
      .eq('review_id', id)
      .is('resolved_at', null);
  }

  return { ok: true };
}

/**
 * 신고 1건 기각(리뷰는 그대로) — resolved_at 만 찍는다.
 * 이미 처리된 신고에 다시 호출해도(더블클릭) `is('resolved_at', null)` 조건에 걸려 0행 매치로
 * 조용히 끝난다 — 에러도, 상태 변화도 없이 멱등.
 */
export async function dismissReport(id: string): Promise<MutationResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: 'not configured' };
  const sb = getSupabase();
  const { error } = await sb
    .from('review_reports')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id)
    .is('resolved_at', null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
