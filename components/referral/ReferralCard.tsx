'use client';

// 마이페이지 "친구 추천" 카드.
// - 내 추천 링크(코드 포함) 표시 + [링크 복사]/[공유] 버튼.
//   navigator.share 가능하면 공유 시트, 아니면 클립보드 복사로 폴백(lib/inapp copyCurrentUrl 재사용).
// - 추천 성공 N명 + "추천하면 둘 다 1주일 무료" 안내.
//
// 코드/성공수는 /api/referral/me에서 가져온다(없으면 lazy 발급됨). SSR 안전: fetch는 effect에서.

import { useEffect, useState } from 'react';
import { copyCurrentUrl } from '@/lib/inapp';

const SITE_ORIGIN = 'https://onek1000.kr';

export function ReferralCard() {
  const [code, setCode] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/referral/me');
        const data = (await res.json()) as { code?: string | null; successCount?: number };
        if (!alive) return;
        setCode(data.code ?? null);
        setSuccessCount(data.successCount ?? 0);
      } catch {
        // 실패 시 안내만 — 링크 없이도 카드는 깨지지 않음
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 절대 URL: 클라이언트면 현재 origin, 아니면 운영 도메인.
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE_ORIGIN;
  const link = code ? `${origin}/?ref=${code}` : '';

  async function handleCopy() {
    if (!link) return;
    const ok = await copyCurrentUrl(link);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  async function handleShare() {
    if (!link) return;
    // navigator.share 가능하면 공유 시트, 아니면 복사 폴백.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: '1000냥 주유소',
          text: '내 주변 최저가 주유소 찾기! 가입하면 둘 다 1주일 무료 🎁',
          url: link,
        });
        return;
      } catch {
        // 사용자가 공유를 취소했거나 미지원 → 복사 폴백
      }
    }
    await handleCopy();
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
        친구 추천하면 둘 다 1주일 무료 🎁
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        내 링크로 친구가 가입하면 친구와 나 모두 프리미엄 7일이 연장돼요.
      </p>

      {loading ? (
        <div className="mt-3 h-9 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      ) : code ? (
        <>
          <div className="mt-3 break-all rounded-lg bg-white px-3 py-2 text-xs text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700">
            {link}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 rounded-full border border-gray-300 py-2 text-xs font-bold text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:active:bg-gray-800"
            >
              {copied ? '복사됨!' : '링크 복사'}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 rounded-full bg-primary py-2 text-xs font-bold text-white active:opacity-90"
            >
              공유하기
            </button>
          </div>
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            추천 성공 <strong className="text-primary">{successCount}명</strong>
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-gray-400">
          추천 링크를 준비 중이에요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}
