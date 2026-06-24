// 첫 화면 공지 팝업 도메인 타입.

/** 공지 1건(DB 행 ↔ API 응답 공용). */
export interface Notice {
  id: string;
  imageUrl: string;        // 팝업에 표시할 이미지(공개 URL)
  linkUrl: string | null;  // 터치 시 이동할 URL(없으면 단순 공지)
  imagePath?: string | null; // storage 경로(관리/정리용, 공개 응답엔 미포함 가능)
  createdAt?: string;
}

/** 공개 GET /api/notice 응답 — 활성 공지 1건 또는 없음(null). */
export interface ActiveNoticeResponse {
  notice: Pick<Notice, 'id' | 'imageUrl' | 'linkUrl'> | null;
}

// 업로드 허용 이미지 타입/용량(리뷰 사진과 동일 기준).
export const NOTICE_IMAGE_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const NOTICE_IMAGE_BYTE_MAX = 5 * 1024 * 1024; // 5MB
