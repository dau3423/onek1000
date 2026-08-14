'use client';

// 공용 뒤로가기 버튼. 3가지 모드를 하나로 수렴한다(FR-2).
//  1) 히스토리 모드(기본, href/label 미지정): 직전 화면으로 router.back(),
//     우리 앱 내 히스토리가 없으면(딥링크/새 탭) 홈("/")으로 폴백.
//  2) Link 모드(href 지정): 지정한 목적지로 <Link> 이동. "목적지 불변" 원칙(AC-2-2)에 따라
//     현행 <Link href> 페이지(/my, /my 서브, / 등)를 히스토리 back으로 바꾸지 않고 그대로 이동.
//  3) 라벨 모드(label 지정): 아이콘+텍스트 인라인 링크(legal 전용). 원형 44px이 아니라
//     세로 py-3으로 히트영역 44px을 확보한 텍스트 링크 형태.
// 파일은 'use client' 1개만 유지 — 클라이언트 컴포넌트도 서버 트리(app/legal/layout.tsx 등)
// 안에서 SSR되므로 서버 컴포넌트에서 Link 모드로 문제없이 렌더된다.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BackIcon } from '@/components/icons';

interface BackButtonProps {
  /** 지정 시 Link 모드(해당 목적지로 이동). 미지정 시 히스토리 모드. */
  href?: string;
  /** 지정 시 라벨 모드(아이콘+텍스트 인라인 링크, legal 전용). */
  label?: string;
  /** aria-label 오버라이드. Link 홈 목적지는 "홈으로" 권장. 기본값 "뒤로 가기". */
  ariaLabel?: string;
  /** 버튼/링크 컨테이너 클래스 오버라이드(기본: 원형 44px). */
  className?: string;
}

// 아이콘 단독 원형 버튼 공통 클래스(44px). dark: 는 다크 지원 화면에서만 유효(라이트 고정 페이지엔 무해).
const ICON_BTN =
  'flex h-11 w-11 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800';

export function BackButton({ href, label, ariaLabel, className }: BackButtonProps) {
  const router = useRouter();

  // 라벨 모드(legal): 아이콘 + 텍스트 인라인 링크. 세로 py-3으로 히트영역 44px 확보.
  // 가시 텍스트(label)가 접근성 이름이 되므로 아이콘은 장식(aria-hidden 기본값) 그대로 둔다.
  if (label) {
    return (
      <Link
        href={href ?? '/'}
        className={
          className ??
          'inline-flex items-center gap-1.5 py-3 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }
        aria-label={ariaLabel}
      >
        <BackIcon className="h-4 w-4" />
        {label}
      </Link>
    );
  }

  // Link 모드(href 지정): 목적지 고정 이동(히스토리 back 아님).
  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel ?? '뒤로 가기'} className={className ?? ICON_BTN}>
        <BackIcon className="h-6 w-6" />
      </Link>
    );
  }

  // 히스토리 모드(기본): window 접근은 클라이언트에서만(이 컴포넌트는 'use client'). SSR 가드 후 폴백.
  const onBack = () => {
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
      aria-label={ariaLabel ?? '뒤로 가기'}
      className={className ?? ICON_BTN}
    >
      <BackIcon className="h-6 w-6" />
    </button>
  );
}
