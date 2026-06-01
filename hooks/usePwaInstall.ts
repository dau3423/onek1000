'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 크롬/엣지(안드로이드·PC)에서 발생하는 beforeinstallprompt 이벤트 타입.
 * 표준 lib.dom.d.ts에 아직 없어 최소 형태로 직접 선언한다.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// beforeinstallprompt는 페이지 마운트 전에 한 번만 발생할 수 있어, 전역에서 1회 캡처해 보관한다.
// (컴포넌트가 늦게 마운트돼도 이벤트를 놓치지 않게 함)
let cachedPrompt: BeforeInstallPromptEvent | null = null;
let listenersAttached = false;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

function attachGlobalListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    // 브라우저 기본 미니 인포바를 막고, 우리 버튼으로 직접 트리거한다.
    e.preventDefault();
    cachedPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    // 설치 완료 시 보관 프롬프트 폐기 → 버튼/배너 숨김.
    cachedPrompt = null;
    notify();
  });
}

/** 현재 standalone(설치된 앱)으로 실행 중인지 — iOS(navigator.standalone) 포함 판별. */
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari 전용 비표준 프로퍼티
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/** iOS(아이폰/아이패드) 사파리 계열인지 — beforeinstallprompt 미지원 플랫폼 판별. */
function detectIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIosDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+는 데스크톱 UA로 위장 → 터치 가능한 Mac을 iPad로 본다.
  const isIpadOs = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return isIosDevice || isIpadOs;
}

export type PwaInstallState = {
  /** 마운트(클라이언트) 후 판별이 끝났는지. SSR/hydration 동안엔 false → UI 미노출. */
  ready: boolean;
  /** 이미 설치되어 standalone으로 실행 중 → 설치 UI 숨김 */
  isStandalone: boolean;
  /** iOS 사파리 계열 → 프로그래매틱 설치 불가, 수동 안내 필요 */
  isIos: boolean;
  /** 네이티브 설치 프롬프트를 띄울 수 있는 상태(크롬/엣지에서 이벤트 캡처됨) */
  canPrompt: boolean;
  /**
   * 설치 UI를 노출할 만한지 종합 판정.
   * - 설치됨이면 false
   * - 네이티브 프롬프트 가능 or iOS면 true
   */
  showInstall: boolean;
  /**
   * 네이티브 설치 프롬프트 실행. 성공/거절/불가 결과를 반환한다.
   * iOS 등 프롬프트 불가 시 'unsupported'.
   */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unsupported'>;
};

/**
 * PWA 설치 상태/액션 훅.
 * - 전역 1회 beforeinstallprompt/appinstalled 리스너로 프롬프트를 캡처
 * - standalone/iOS 판별은 클라이언트 마운트 후에만 수행(hydration mismatch 방지)
 */
export function usePwaInstall(): PwaInstallState {
  const [ready, setReady] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  // cachedPrompt 변화를 리렌더로 반영하기 위한 버전 카운터
  const [, setVersion] = useState(0);

  useEffect(() => {
    attachGlobalListeners();
    setIsStandalone(detectStandalone());
    setIsIos(detectIos());
    setReady(true);

    const onChange = () => setVersion((v) => v + 1);
    subscribers.add(onChange);

    // standalone 전환(설치 직후 등) 감지 — 미디어쿼리 변화도 반영
    const mql = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayChange = () => setIsStandalone(detectStandalone());
    mql?.addEventListener?.('change', onDisplayChange);

    return () => {
      subscribers.delete(onChange);
      mql?.removeEventListener?.('change', onDisplayChange);
    };
  }, []);

  const canPrompt = ready && !isStandalone && cachedPrompt !== null;

  const promptInstall = useCallback<PwaInstallState['promptInstall']>(async () => {
    if (!cachedPrompt) return 'unsupported';
    const evt = cachedPrompt;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    // 프롬프트는 1회용 — 사용 후 폐기하고 구독자에게 알린다.
    cachedPrompt = null;
    notify();
    return outcome;
  }, []);

  const showInstall = ready && !isStandalone && (canPrompt || isIos);

  return { ready, isStandalone, isIos, canPrompt, showInstall, promptInstall };
}
