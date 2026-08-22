'use client';

// 제보 검수 화면(운영자용).
//  - 마운트 시 GET /api/admin/corrections 로 미처리 제보를 불러온다(오래된 순).
//  - [승인]: PATCH /api/admin/corrections/[id] { approve:true } — 즉시 서비스에 반영된다.
//  - [반려]: 같은 엔드포인트 { approve:false } — 아무것도 반영되지 않는다.
//  - 처리 후에는 목록을 다시 불러온다(낙관적 갱신 대신 — 운영 도구라 정확성 우선).
//
// 판단 근거를 한 카드에 모아 보여주는 게 이 화면의 전부다:
// 대상 이름·주소, 현재 저장된 값, 제보값, 첨부 사진, 제보자.

import { useCallback, useEffect, useState } from 'react';
import type { AdminCorrectionItem, CorrectionQueue } from '@/lib/db/corrections';
import type { FuelPricePayload, RepairBrandPayload } from '@/types/correction';
import { PRODUCT_LABEL } from '@/types/station';
import type { RepairBrand } from '@/types/repair';

const KIND_LABEL: Record<string, string> = {
  repair_brand: '정비소 브랜드',
  fuel_price: '주유소 유가',
};

// 브랜드 코드 → 사람이 읽는 이름. messages/ko.json 의 repair.brandLabel 과 같은 표기를 쓴다
// (관리 화면은 (intl) 밖이라 next-intl 프로바이더가 없다 — 여기서만 쓰는 상수로 둔다).
const BRAND_LABEL: Record<RepairBrand, string> = {
  autoq: '기아 오토큐',
  bluehands: '현대 블루핸즈',
  speedmate: 'SK 스피드메이트',
  renault: '르노코리아',
  autooasis: '오토오아시스',
  kgm: '쌍용 · KG모빌리티',
  chevrolet: '쉐보레 · GM',
  carpos: '카포스',
  gongim: '공임나라',
  tire: '타이어 전문',
  inspection: '자동차검사소',
  imported: '수입차',
};

function brandName(code: string | null | undefined): string {
  if (!code) return '브랜드 없음(무소속)';
  return BRAND_LABEL[code as RepairBrand] ?? code;
}

function personLabel(p: { nickname: string | null; name: string | null; email: string | null }): string {
  return p.nickname || p.name || p.email || '(알 수 없음)';
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** 제보값 한 줄 표기 — 종류별로 모양이 다르다. */
function reportedValue(item: AdminCorrectionItem): string {
  if (item.kind === 'repair_brand') {
    return brandName((item.payload as RepairBrandPayload).brand);
  }
  const p = item.payload as FuelPricePayload;
  const label = PRODUCT_LABEL[p.product] ?? p.product;
  return `${label} ${p.price.toLocaleString('ko-KR')}원`;
}

/** 현재 저장된 값 — 브랜드 제보는 코드라 이름으로 바꿔 보여준다. */
function currentValue(item: AdminCorrectionItem): string {
  if (item.kind === 'repair_brand') return brandName(item.currentValue);
  return item.currentValue ?? '가격 없음';
}

export function CorrectionsAdminClient() {
  const [queue, setQueue] = useState<CorrectionQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch('/api/admin/corrections', { cache: 'no-store' });
      if (!r.ok) throw new Error(`목록을 불러오지 못했습니다 (${r.status})`);
      setQueue((await r.json()) as CorrectionQueue);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string, approve: boolean) {
    setBusyId(id);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/corrections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `처리 실패 (${r.status})`);
      setMsg({
        kind: 'ok',
        text: approve
          ? '승인했습니다. 서비스에 바로 반영됩니다.'
          : '반려했습니다. 아무것도 반영되지 않습니다.',
      });
      await load();
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    // 관리 도구는 가독성 우선 — 라이트 배경+진한 글자로 고정.
    <main
      className="mx-auto min-h-dvh max-w-3xl bg-gray-50 px-4 py-8 text-gray-900"
      style={{ colorScheme: 'light' }}
    >
      <header className="mb-6">
        <p className="text-xs font-medium text-gray-500">운영자용 · 사용자 제보 검수</p>
        <h1 className="mt-1 text-xl font-extrabold text-gray-900">📝 제보 검수</h1>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          승인하면 곧바로 서비스에 반영됩니다. 유가 제보는 오피넷이 더 최신 가격을 받으면 자동으로
          내려갑니다. 확실하지 않으면 반려하세요 — 틀린 정보는 사용자를 헛걸음하게 만듭니다.
        </p>
      </header>

      {msg && (
        <p className={`mb-4 text-sm font-medium ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}

      {loading && <p className="py-8 text-center text-sm text-gray-500">불러오는 중…</p>}

      {!loading && loadError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>
      )}

      {!loading && !loadError && queue && (
        <>
          {queue.tableMissing && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              제보 테이블(place_corrections)이 아직 없습니다. 마이그레이션 0049를 적용하면 제보
              대기열이 여기 표시됩니다.
            </p>
          )}

          <section aria-label="대기 중 제보">
            <h2 className="mb-3 text-sm font-bold text-gray-700">
              대기 중 제보 ({queue.pending.length})
            </h2>
            {queue.pending.length === 0 ? (
              <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                처리할 제보가 없습니다.
              </p>
            ) : (
              <ul className="space-y-4">
                {queue.pending.map((item) => (
                  <PendingCard
                    key={item.id}
                    item={item}
                    busy={busyId === item.id}
                    onApprove={() => resolve(item.id, true)}
                    onReject={() => resolve(item.id, false)}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function PendingCard({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: AdminCorrectionItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const detailHref = item.targetType === 'repair' ? '/repair' : '/station';
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">
          {KIND_LABEL[item.kind] ?? item.kind}
        </span>
        <span className="text-xs text-gray-400">{fmtDate(item.reportedAt)}</span>
      </div>

      <p className="mt-2 text-sm font-bold text-gray-900">
        {item.targetName ?? '(대상 이름 없음)'}
      </p>
      {item.targetAddress && <p className="text-xs text-gray-500">{item.targetAddress}</p>}
      <a
        href={`${detailHref}/${encodeURIComponent(item.targetId)}`}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-block text-xs text-primary hover:underline"
      >
        상세 페이지 열기 ↗
      </a>

      {/* 현재값 → 제보값. 나란히 놓아야 무엇을 바꾸는 제보인지 한눈에 보인다. */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm">
        <span className="text-gray-500 line-through">{currentValue(item)}</span>
        <span className="text-gray-400">→</span>
        <span className="font-bold text-gray-900">{reportedValue(item)}</span>
      </div>

      {item.photoUrls.length > 0 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {item.photoUrls.map((url, i) => (
            // 원본을 새 탭에서 열 수 있게 링크로 감싼다 — 썸네일만으로는 간판·가격판 글씨가 안 읽힌다.
            <a key={`${url}-${i}`} href={url} target="_blank" rel="noreferrer" className="flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`제보 사진 ${i + 1}`}
                className="h-24 w-24 rounded-lg border border-gray-200 object-cover"
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">첨부 사진 없음 — 근거 없이 승인하지 마세요.</p>
      )}

      <p className="mt-3 text-xs text-gray-500">제보자: {personLabel(item.reporter)}</p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? '처리 중…' : '승인'}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-bold text-gray-600 disabled:opacity-50"
        >
          반려
        </button>
      </div>
    </li>
  );
}
