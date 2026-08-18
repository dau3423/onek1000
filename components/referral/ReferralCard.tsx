'use client';

// 마이페이지 "친구 추천" 카드.
// - 내 추천 링크(코드 포함) 표시 + [링크 복사]/[공유] 버튼.
//   navigator.share 가능하면 공유 시트, 아니면 클립보드 복사로 폴백(lib/inapp copyCurrentUrl 재사용).
// - 추천 성공 N명 + "추천하면 둘 다 프리미엄 혜택 7일" 안내.
//
// 코드/성공수는 /api/referral/me에서 가져온다(없으면 lazy 발급됨). SSR 안전: fetch는 effect에서.

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GiftIcon } from '@/components/icons';
import { copyCurrentUrl } from '@/lib/inapp';

const SITE_ORIGIN = 'https://onek1000.kr';

export function ReferralCard() {
  const t = useTranslations('my.referral');
  const tCommon = useTranslations('common');
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
          title: tCommon('appName'),
          text: t('shareText'),
          url: link,
        });
        return;
      } catch {
        // 사용자가 공유를 취소했거나 미지원 → 복사 폴백
      }
    }
    await handleCopy();
  }

  // 마이페이지 메인(app/my/page.tsx, sections.tsx)이 bg-white 라이트 고정이므로,
  // 일관성과 대비를 위해 이 카드도 라이트 톤으로 통일한다(프리미엄 카드와 동일 톤).
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="text-sm font-bold text-gray-900">
        {t('title')}{' '}
        <GiftIcon className="inline-block h-4 w-4 align-[-0.125em]" />
      </div>
      <p className="mt-1 text-xs text-gray-600">
        {t('description')}
      </p>

      {loading ? (
        <div className="mt-3 h-9 animate-pulse rounded-lg bg-gray-100" />
      ) : code ? (
        <>
          <div className="mt-3 break-all rounded-lg bg-white px-3 py-2 text-xs text-gray-800 ring-1 ring-gray-200">
            {link}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 rounded-full border border-gray-300 bg-white py-2 text-xs font-bold text-gray-700 active:bg-gray-100"
            >
              {copied ? t('copiedAction') : t('copyAction')}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 rounded-full bg-primary py-2 text-xs font-bold text-white active:opacity-90"
            >
              {t('shareAction')}
            </button>
          </div>
          <div className="mt-3 text-xs text-gray-600">
            {t.rich('successCount', {
              count: successCount,
              b: (chunks) => <strong className="text-primary">{chunks}</strong>,
            })}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-gray-500">
          {t('preparingMessage')}
        </p>
      )}
    </div>
  );
}
