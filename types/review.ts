// 1000냥 주유소 - 리뷰 타입

export interface Review {
  id: string;
  stationId: string;
  user: {
    id: string;
    name: string | null;
    imageUrl: string | null;
  };
  rating: 1 | 2 | 3 | 4 | 5;
  content: string;
  /** 클라이언트가 바로 표시할 수 있는 서명 URL 배열 */
  photoUrls: string[];
  createdAt: string;
  updatedAt: string;
  /** 현재 사용자가 작성한 리뷰인지 (수정/삭제 노출 분기) */
  isMine?: boolean;
}

export interface ReviewStats {
  count: number;
  average: number; // 0.0 ~ 5.0
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface CreateReviewInput {
  rating: 1 | 2 | 3 | 4 | 5;
  content: string;
  /** 업로드 직후 받은 storage 경로들 (review-photos/<userId>/<uuid>.jpg) */
  photoPaths: string[];
}

export const REVIEW_CONTENT_MAX = 500;
export const REVIEW_PHOTO_MAX = 5;
export const REVIEW_PHOTO_BYTE_MAX = 5 * 1024 * 1024; // 5MB
