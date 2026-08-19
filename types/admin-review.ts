// 운영자 리뷰 모더레이션 화면(/admin/reviews) 전용 타입.
// /admin 은 다국어 대상이 아니라서(app/(intl) 밖) 여기 문자열은 전부 한국어로 직접 표기한다.

import type { PlaceType, ReportReason } from './review';

/** 리뷰 작성자 또는 신고자 — 운영자 화면에서 "누구인지" 식별하는 데 필요한 최소 정보. */
export interface AdminReviewPerson {
  id: string;
  nickname: string | null;
  name: string | null;
  email: string | null;
}

/** 모더레이션 카드에 필요한 리뷰 요약 정보. */
export interface AdminReviewSummary {
  id: string;
  rating: number;
  content: string;
  photoUrls: string[];
  isHidden: boolean;
  targetType: PlaceType;
  /** 장소 식별자(target_id 없으면 station_id 로 대체 — 0040 이전 구행 호환). */
  targetId: string | null;
  createdAt: string;
  author: AdminReviewPerson;
}

/** 신고 1건 — 사유·신고자·시각. */
export interface AdminReportItem {
  id: string;
  reason: ReportReason;
  detail: string | null;
  createdAt: string;
  reporter: AdminReviewPerson;
}

/** 미처리 신고를 리뷰 단위로 묶은 대기열 항목. */
export interface AdminQueueItem {
  review: AdminReviewSummary;
  reports: AdminReportItem[];
}

/** GET /api/admin/reviews/reports 응답 전체. */
export interface ModerationQueue {
  /** 미처리 신고가 있는 리뷰(아직 안 숨김) — 리뷰 단위로 묶임. */
  pending: AdminQueueItem[];
  /** 현재 전역 숨김 상태인 리뷰 — 신고 유무와 무관(과거 수동 숨김 포함), 숨김 해제용. */
  hidden: AdminReviewSummary[];
  /** review_reports 테이블이 아직 없음(0041 미적용). true 면 pending 은 항상 빈 배열. */
  reportsTableMissing: boolean;
}
