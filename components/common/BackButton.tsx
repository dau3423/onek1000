'use client';

// 상세 페이지(주유소/충전소) 공통 뒤로가기 버튼.
// 직전 화면(주유 기록 목록/지도 등)으로 돌아가도록 브라우저 히스토리(router.back)를 사용한다.
// 딥링크/새 탭 등 우리 앱 내 이동 히스토리가 없을 때만 폴백으로 홈("/")으로 보낸다.
import { useRouter } from 'next/navigation';

/**
 * 브라우저 히스토리가 있으면(목록/지도 등에서 넘어온 경우) 직전 화면으로 돌아가고,
 * 주소창/딥링크로 직접 진입해 히스토리가 없으면 홈("/")으로 폴백한다.
 */
export function BackButton() {
  const router = useRouter();

  const onBack = () => {
    // window 접근은 클라이언트에서만(이 컴포넌트는 'use client'). SSR 가드 후 폴백.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="뒤로 가기"
      className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100"
    >
      ←
    </button>
  );
}
