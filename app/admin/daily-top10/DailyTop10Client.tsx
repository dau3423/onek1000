'use client';

import { useMemo, useState } from 'react';
import type { DailyTop10Item } from '@/types/station';
import {
  buildXText,
  buildTistoryHtml,
  formatPrice,
  brandLabel,
  sidoLabel,
} from '@/lib/daily-top10';

interface Props {
  date: string;
  gasoline: DailyTop10Item[];
  diesel: DailyTop10Item[];
}

/** 클립보드 복사(navigator.clipboard → execCommand 폴백). lib/inapp.ts copyCurrentUrl 패턴 동일. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 폴백으로 진행
  }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

type Flash = '' | 'ok' | 'fail';

function Top10Table({
  title,
  accent,
  items,
}: {
  title: string;
  accent: string;
  items: DailyTop10Item[];
}) {
  // 흰 배경 고정(라이트). accent(#374151 경유 등)는 흰 배경 가정 색이라 대비 보장.
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <h2 className="mb-2 text-base font-bold" style={{ color: accent }}>
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">데이터가 없습니다.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="w-9 py-2 text-center font-medium">순위</th>
              <th className="py-2 font-medium">주유소</th>
              <th className="hidden py-2 font-medium sm:table-cell">브랜드</th>
              <th className="py-2 font-medium">지역</th>
              <th className="py-2 text-right font-medium">가격</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={`${it.id}-${it.rank}`}
                className="border-b border-gray-100 last:border-0"
              >
                <td
                  className="py-2 text-center font-bold"
                  style={{ color: accent }}
                >
                  {it.rank}
                </td>
                <td className="py-2 font-semibold text-gray-900">
                  {it.name}
                </td>
                <td className="hidden py-2 text-gray-600 sm:table-cell">
                  {brandLabel(it)}
                </td>
                <td className="py-2 text-gray-600">
                  {sidoLabel(it)}
                  {it.isSelf && (
                    <span className="ml-1 text-xs text-primary">셀프</span>
                  )}
                </td>
                <td className="py-2 text-right font-bold tabular-nums text-gray-900">
                  {formatPrice(it.price)}원
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function DailyTop10Client({ date, gasoline, diesel }: Props) {
  const [xFlash, setXFlash] = useState<Flash>('');
  const [htmlFlash, setHtmlFlash] = useState<Flash>('');

  const xText = useMemo(
    () => buildXText(date, gasoline, diesel),
    [date, gasoline, diesel],
  );
  const xLen = useMemo(() => [...xText].length, [xText]);
  const tistoryHtml = useMemo(
    () => buildTistoryHtml(date, gasoline, diesel),
    [date, gasoline, diesel],
  );

  const handleCopyX = async () => {
    const ok = await copyText(xText);
    setXFlash(ok ? 'ok' : 'fail');
    setTimeout(() => setXFlash(''), 2000);
  };

  const handleCopyHtml = async () => {
    const ok = await copyText(tistoryHtml);
    setHtmlFlash(ok ? 'ok' : 'fail');
    setTimeout(() => setHtmlFlash(''), 2000);
  };

  // 이미지 카드: 서버에서 동일 DB로 산출한 PNG를 받아 다운로드(파일명에 날짜 포함).
  const ymd = date.replace(/[^0-9]/g, '').slice(0, 8);
  const imgUrl = `/api/og/daily-top10?v=${ymd}`;

  return (
    // 관리 도구는 가독성 우선 — OS 다크모드와 무관하게 라이트 배경+진한 글자로 고정.
    <main
      className="mx-auto min-h-dvh max-w-2xl bg-gray-50 px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] text-gray-900"
      style={{ colorScheme: 'light' }}
    >
      <header className="py-4">
        <p className="text-xs font-medium text-gray-500">
          운영자용 · 매일 SNS 게시 도우미
        </p>
        <h1 className="mt-1 text-xl font-extrabold text-gray-900">
          ⛽ {date} 전국 최저가 TOP10
        </h1>
        <p className="mt-1 text-xs text-gray-500">
          데이터: 우리 DB(오피넷 동기화 기준) · 가격 오름차순 전국 상위 10
        </p>
      </header>

      {/* 공유 액션 */}
      <section className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={handleCopyX}
          className="flex items-center justify-center gap-1 rounded-lg bg-black px-3 py-3 text-sm font-bold text-white transition active:scale-95"
        >
          {xFlash === 'ok' ? '복사됨 ✓' : xFlash === 'fail' ? '복사 실패' : 'X용 텍스트 복사'}
        </button>
        <button
          type="button"
          onClick={handleCopyHtml}
          className="flex items-center justify-center gap-1 rounded-lg bg-[#EF562F] px-3 py-3 text-sm font-bold text-white transition active:scale-95"
        >
          {htmlFlash === 'ok'
            ? '복사됨 ✓'
            : htmlFlash === 'fail'
              ? '복사 실패'
              : '티스토리용 HTML 복사'}
        </button>
        <a
          href={imgUrl}
          download={`onek1000-top10-${ymd}.png`}
          className="flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-3 text-sm font-bold text-white transition active:scale-95"
        >
          X용 이미지 카드 다운로드
        </a>
      </section>

      {/* X 텍스트 미리보기 + 글자수 */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">
            X 미리보기
          </span>
          <span
            className={`text-xs font-bold tabular-nums ${
              xLen > 280 ? 'text-red-500' : 'text-gray-500'
            }`}
          >
            {xLen} / 280자
          </span>
        </div>
        <pre className="whitespace-pre-wrap break-words text-sm text-gray-800">
          {xText}
        </pre>
      </section>

      {/* TOP10 표 */}
      <div className="space-y-4">
        <Top10Table title="🟢 휘발유 TOP10" accent="#16a34a" items={gasoline} />
        <Top10Table title="⚫ 경유 TOP10" accent="#374151" items={diesel} />
      </div>

      <p className="mt-6 text-center text-xs text-gray-500">
        티스토리 HTML은 글쓰기 화면을 &lt;HTML&gt; 모드로 바꾼 뒤 붙여넣으세요.
        <br />
        출처: 한국석유공사 오피넷 · onek1000.kr
      </p>
    </main>
  );
}
