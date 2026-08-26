'use client';

// 긴급출동 화면 — "지금 어디인지 말할 수 있게" + "내 보험사로 바로 전화".
//
// 설계 원칙(사고 현장 기준):
//  1) **로그인을 요구하지 않는다.** 급할 때 로그인 화면을 띄우는 건 최악이다.
//     로그인은 '내 보험사를 맨 위에 고정'하는 편의일 뿐, 전체 목록은 누구나 바로 쓴다.
//  2) 위치는 화면에 뜨는 즉시 요청한다. 사용자가 버튼을 한 번 더 누르게 하지 않는다.
//  3) 주소 조회가 실패해도 좌표만으로 성립한다. 어떤 실패도 화면을 막지 않는다.
//  4) 보험사에 위치를 **자동 전송할 방법은 없다**(공개 API·딥링크 없음, 대표번호는 SMS 미수신).
//     상담원은 어차피 구두로 위치를 확인하므로, 읽어 줄 수 있게 만드는 것이 실질적 해법이다.

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useGeolocation } from '@/hooks/useGeolocation';
import { INSURERS, findInsurer, telHref, type InsurerId } from '@/lib/insurance/companies';
import { track } from '@/lib/analytics';
import { PinIcon, PhoneIcon, CheckIcon, LoaderIcon } from '@/components/icons';

interface Landmark {
  kind: 'highway' | 'gas' | 'repair';
  name: string;
  distanceM: number;
  routeName?: string | null;
  direction?: string | null;
}

function fmtDist(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

export function EmergencyClient() {
  const t = useTranslations('emergency');
  const tCommon = useTranslations('common');
  const { status } = useSession();
  // 화면에 들어오면 즉시 위치 추적을 시작한다(버튼을 한 번 더 누르게 하지 않는다).
  const geo = useGeolocation(true);

  const [address, setAddress] = useState<{ road: string | null; jibun: string | null } | null>(null);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [myInsurer, setMyInsurer] = useState<InsurerId | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // 진입 계측 — 마운트 1회. 실제로 쓰이는 기능인지 판단할 근거가 된다.
  useEffect(() => { track('emergency_open'); }, []);

  // 내 보험사 — 비로그인이면 조회하지 않는다(401 을 굳이 만들지 않는다).
  useEffect(() => {
    if (status !== 'authenticated') return;
    let alive = true;
    fetch('/api/me/insurance')
      .then((r) => r.json())
      .then((j) => { if (alive) setMyInsurer((j?.insurer as InsurerId | null) ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [status]);

  // 좌표가 잡히면 주소·랜드마크를 한 번 받아온다.
  // 좌표 전체가 아니라 위경도만 의존성에 둔다 — watchPosition 은 값이 같아도 자주 발화한다.
  const lat = geo.coords?.lat;
  const lng = geo.coords?.lng;
  // 좌표를 소수 4자리(약 11m)로 끊어 미세한 GPS 지터로 재조회하지 않게 한다.
  // 의존성 배열에는 이 값만 넣는다 — 배열 안에서 계산하면 정적 검사가 안 된다.
  const latKey = lat != null ? lat.toFixed(4) : null;
  const lngKey = lng != null ? lng.toFixed(4) : null;
  useEffect(() => {
    if (lat == null || lng == null) return;
    let alive = true;
    setCtxLoading(true);
    fetch(`/api/emergency/context?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setAddress(j?.address ?? null);
        setLandmarks(Array.isArray(j?.landmarks) ? j.landmarks : []);
      })
      .catch(() => {})
      .finally(() => { if (alive) setCtxLoading(false); });
    return () => { alive = false; };
    // lat/lng 원본이 아니라 양자화 키에만 반응한다(위 latKey 주석 참고).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latKey, lngKey]);

  /** 상담원에게 읽어 주거나 보험사 앱에 붙여넣을 한 덩어리 텍스트. */
  const locationText = useCallback(() => {
    const parts: string[] = [];
    const addr = address?.road ?? address?.jibun;
    if (addr) parts.push(addr);
    if (lat != null && lng != null) {
      parts.push(t('copyCoords', { lat: lat.toFixed(6), lng: lng.toFixed(6) }));
    }
    const near = landmarks[0];
    if (near) parts.push(t('copyNear', { name: near.name, dist: fmtDist(near.distanceM) }));
    return parts.join('\n');
  }, [address, lat, lng, landmarks, t]);

  const copyLocation = async () => {
    const text = locationText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track('emergency_copy_location');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 클립보드 권한이 없으면 조용히 넘어간다 — 화면의 주소를 직접 읽으면 된다 */
    }
  };

  const saveInsurer = async (id: InsurerId) => {
    // 비로그인은 저장하지 않고 이번 화면에서만 위로 올린다(로그인을 강요하지 않는다).
    if (status !== 'authenticated') { setMyInsurer(id); return; }
    setSaving(true);
    setMyInsurer(id);
    try {
      await fetch('/api/me/insurance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insurer: id }),
      });
    } catch {
      /* 저장 실패해도 이번 화면에서는 선택이 유지된다 */
    } finally {
      setSaving(false);
    }
  };

  const mine = findInsurer(myInsurer);
  const rest = INSURERS.filter((i) => i.id !== myInsurer);
  const addrText = address?.road ?? address?.jibun ?? null;

  return (
    <div className="px-5 pb-10">
      {/* ── 지금 내 위치 ── */}
      <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-1.5">
          <PinIcon className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-gray-900">{t('locationTitle')}</h2>
        </div>

        {geo.status === 'denied' ? (
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800">
            {t('locationDenied')}
            <button
              onClick={geo.request}
              className="mt-2 block rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-[12px] font-bold text-amber-800"
            >
              {tCommon('retry')}
            </button>
          </div>
        ) : !geo.coords ? (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-gray-500">
            <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
            {t('locating')}
          </p>
        ) : (
          <>
            {addrText ? (
              <p className="mt-2 break-words text-[15px] font-bold leading-snug text-gray-900">{addrText}</p>
            ) : ctxLoading ? (
              <p className="mt-2 text-[13px] text-gray-500">{t('addressLoading')}</p>
            ) : (
              <p className="mt-2 text-[13px] text-gray-500">{t('addressNotFound')}</p>
            )}
            <p className="mt-1 text-[12px] tabular-nums text-gray-500">
              {t('coords', { lat: geo.coords.lat.toFixed(6), lng: geo.coords.lng.toFixed(6) })}
            </p>

            {landmarks.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3">
                {landmarks.map((l, i) => (
                  <li key={`${l.name}-${i}`} className="flex items-baseline gap-1.5 text-[13px] text-gray-700">
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">
                      {t(`kind.${l.kind}`)}
                    </span>
                    <span className="min-w-0 break-words">
                      {l.name}
                      {l.kind === 'highway' && l.routeName ? ` (${l.routeName}${l.direction ? ` ${l.direction}` : ''})` : ''}
                      <b className="ml-1 text-gray-900">{fmtDist(l.distanceM)}</b>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={copyLocation}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-gray-50 py-3 text-sm font-bold text-gray-800 hover:bg-gray-100"
            >
              {copied ? <><CheckIcon className="h-4 w-4 text-green-600" />{t('copied')}</> : t('copyLocation')}
            </button>
            <p className="mt-1.5 text-center text-[11px] leading-relaxed text-gray-400">
              {t('copyHint')}
            </p>
          </>
        )}
      </section>

      {/* ── 내 보험사 ── */}
      {mine && (
        <section className="mt-4 rounded-2xl border-2 border-primary bg-orange-50 p-4">
          <p className="text-[12px] font-bold text-orange-800">{t('myInsurer')}</p>
          <p className="mt-0.5 text-lg font-extrabold text-gray-900">{mine.name}</p>
          <a
            href={telHref(mine.tel)}
            onClick={() => track('emergency_call', { insurer: mine.id, mine: true })}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-lg font-extrabold text-white shadow-sm"
          >
            <PhoneIcon className="h-5 w-5" />
            {mine.tel}
          </a>
        </section>
      )}

      {/* ── 전체 보험사 ── */}
      <section className="mt-4">
        <h2 className="text-sm font-bold text-gray-900">
          {mine ? t('otherTitle') : t('selectTitle')}
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
          {t.rich('listHint', { b: (c) => <b>{c}</b> })}
        </p>
        <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {rest.map((ins) => (
            <li key={ins.id} className="flex items-center gap-2 px-4 py-3">
              <a
                href={telHref(ins.tel)}
                onClick={() => track('emergency_call', { insurer: ins.id, mine: false })}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-gray-900">{ins.name}</span>
                  <span className="block text-[13px] tabular-nums text-primary">{ins.tel}</span>
                </span>
                <PhoneIcon className="h-4 w-4 shrink-0 text-gray-300" />
              </a>
              <button
                onClick={() => saveInsurer(ins.id)}
                disabled={saving}
                aria-label={t('saveAria', { name: ins.name })}
                className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                {t('saveAction')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-[11px] leading-relaxed text-gray-500">
        {t.rich('disclaimer', { b: (c) => <b className="text-gray-800">{c}</b> })}
      </p>
    </div>
  );
}
