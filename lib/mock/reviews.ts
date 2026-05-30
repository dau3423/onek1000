// 개발 모드용 mock 리뷰 데이터.
// USE_MOCK=true 일 때 GET 응답으로 사용. POST는 메모리에만 임시 저장 → 서버 재시작 시 사라짐.

import type { Review } from '@/types/review';

const today = new Date();
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const seed: Review[] = [
  {
    id: 'mock-rev-1',
    stationId: 'A0010003',
    user: { id: 'mock-u1', nickname: '주니코드', name: '주니코드', imageUrl: null },
    rating: 5,
    content: '강남에서 이만한 가격은 진짜 드물어요. 셀프라 빠르고 세차장도 깔끔합니다.',
    photoUrls: [
      'https://images.unsplash.com/photo-1545459720-aac8509eb02c?w=600&q=80',
    ],
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  },
  {
    id: 'mock-rev-2',
    stationId: 'A0010003',
    user: { id: 'mock-u2', nickname: '연비왕', name: '연비왕', imageUrl: null },
    rating: 4,
    content: '셀프 결제가 카드만 되는 게 아쉽긴 한데 가격이 좋아서 자주 옵니다.',
    photoUrls: [],
    createdAt: daysAgo(7),
    updatedAt: daysAgo(7),
  },
  {
    id: 'mock-rev-3',
    stationId: 'A0010003',
    user: { id: 'mock-u3', nickname: '강남러', name: '강남러', imageUrl: null },
    rating: 3,
    content: '주말 저녁엔 줄이 좀 깁니다. 가격은 만족.',
    photoUrls: [],
    createdAt: daysAgo(14),
    updatedAt: daysAgo(14),
  },
  {
    id: 'mock-rev-4',
    stationId: 'A0010001',
    user: { id: 'mock-u4', nickname: '경유민수', name: '경유민수', imageUrl: null },
    rating: 4,
    content: 'GS답게 시설 깨끗하고 직원분이 친절해요.',
    photoUrls: [
      'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80',
      'https://images.unsplash.com/photo-1571127236794-81c0bbfe1ce3?w=600&q=80',
    ],
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
];

// 메모리 캐시 (개발 모드 POST 임시 저장)
const memoryReviews: Review[] = [];

export function listMockReviews(stationId: string): Review[] {
  return [...seed.filter((r) => r.stationId === stationId), ...memoryReviews.filter((r) => r.stationId === stationId)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function appendMockReview(r: Review) {
  memoryReviews.push(r);
}

export function removeMockReview(id: string) {
  const i = memoryReviews.findIndex((r) => r.id === id);
  if (i >= 0) memoryReviews.splice(i, 1);
}
