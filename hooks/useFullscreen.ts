'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

// Fullscreen API 벤더 프리픽스(구 WebKit) 보강용 타입.
// iOS Safari(아이폰)는 요소 전체화면 자체를 미지원하므로 supported=false로 처리한다.
interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FsDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

/**
 * 대상 요소의 브라우저 전체화면 토글 훅.
 * - SSR/hydration 안전: 지원 여부는 마운트 후 클라이언트에서만 판별.
 * - 미지원 브라우저(iOS Safari 등)에서는 supported=false → 호출부에서 버튼을 숨기거나 비활성.
 */
export function useFullscreen(targetRef: RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const doc = document as FsDocument;
    const el = targetRef.current as FsElement | null;
    // 요소가 requestFullscreen을 갖고, document가 exit을 지원할 때만 가능.
    const ok = !!(
      (el?.requestFullscreen || el?.webkitRequestFullscreen)
      && (doc.exitFullscreen || doc.webkitExitFullscreen)
    );
    setSupported(ok);

    const onChange = () => {
      const active = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      setIsFullscreen(active);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    onChange();
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [targetRef]);

  const toggle = useCallback(async () => {
    const doc = document as FsDocument;
    const el = targetRef.current as FsElement | null;
    if (!el) return;
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      } else {
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      // 사용자 제스처 부재/권한 거부 등은 무시(버튼 외 영향 없음)
    }
  }, [targetRef]);

  return { isFullscreen, supported, toggle };
}
