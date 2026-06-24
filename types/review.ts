// 1000냥 주유소 - 리뷰 타입

export interface Review {
  id: string;
  stationId: string;
  user: {
    id: string;
    /** 표시용 닉네임(없으면 name → '익명' 폴백) */
    nickname: string | null;
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
  /** 작성 시점 사용자 위치(지오펜스 검증용). 주유소 근처에서만 작성 가능 — 서버가 거리로 검증. */
  lat?: number;
  lng?: number;
  /** GPS 정확도(m). 위치 오차가 큰 환경에서 과도한 차단을 줄이기 위해 허용 반경에 일부 가산. */
  accuracy?: number;
}

export const REVIEW_CONTENT_MAX = 500;
export const REVIEW_PHOTO_MAX = 5;
export const REVIEW_PHOTO_BYTE_MAX = 5 * 1024 * 1024; // 5MB

// ─── 리뷰 지오펜스 ───
// 리뷰는 "해당 주유소 근처"에서만 작성할 수 있다(실방문 신뢰 + 이벤트 어뷰징 방지).
// 기본 허용 반경(m). GPS 정확도(accuracy)가 큰 경우 아래 캡까지 추가로 허용한다.
export const REVIEW_GEOFENCE_M = 500;
// 정확도 가산 상한(m) — accuracy가 아무리 커도 이 값까지만 허용 반경에 더한다.
export const REVIEW_GEOFENCE_ACCURACY_CAP_M = 300;
