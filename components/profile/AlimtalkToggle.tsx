'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChatIcon, SmartphoneIcon } from '@/components/icons';
import { normalizePhone, isValidPhone, formatPhone } from '@/lib/phone';

/**
 * 알림 설정(카카오 알림톡 수신 동의 + 휴대폰번호) 카드.
 * 서버에서 검증한 현재 값(initialOptIn / initialPhone)을 초기 상태로 받는다.
 *
 * - 알림톡 토글: PATCH /api/profile { alimtalkOptIn } 로 즉시 저장(낙관적 반영, 실패 시 원복).
 * - 휴대폰번호: 입력 후 저장 버튼으로 PATCH /api/profile { phone }. 서버에서 정규화·검증.
 * - 알림톡 ON 인데 번호가 없으면 "번호 입력 필요" 안내 한 줄을 노출한다.
 *
 * 휴대폰번호는 알림톡 발송·결제 프리필 용도로 수집한다. 개인정보이므로 화면에선 마스킹해 보여준다.
 */
export function AlimtalkToggle({
  initialOptIn,
  initialPhone,
}: {
  initialOptIn: boolean;
  initialPhone: string | null;
}) {
  const t = useTranslations('my');
  const [optIn, setOptIn] = useState(initialOptIn);
  const [busy, setBusy] = useState(false);

  // 저장된(서버 확정) 번호 — 숫자열. 마스킹 표시·"번호 있음" 판정의 기준.
  const [savedPhone, setSavedPhone] = useState<string>(initialPhone ?? '');
  const [phoneInput, setPhoneInput] = useState<string>(initialPhone ? formatPhone(initialPhone) : '');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [phoneSaved, setPhoneSaved] = useState(false);

  const toggle = async () => {
    const next = !optIn;
    setBusy(true);
    setOptIn(next); // 낙관적 반영
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alimtalkOptIn: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t('alimtalk.saveFailed'));
      }
    } catch (e) {
      setOptIn(!next); // 실패 시 원복
      alert(e instanceof Error ? e.message : t('alimtalk.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const savePhone = async () => {
    setPhoneError('');
    setPhoneSaved(false);
    const digits = normalizePhone(phoneInput);
    // 빈 값은 삭제(null) 허용, 값이 있으면 형식 검증.
    if (digits !== '' && !isValidPhone(digits)) {
      setPhoneError(t('alimtalk.phoneInvalid'));
      return;
    }
    setPhoneBusy(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      });
      const data = (await res.json().catch(() => ({}))) as { phone?: string | null; error?: string };
      if (!res.ok) throw new Error(data.error ?? t('alimtalk.saveFailed'));
      const next = data.phone ?? '';
      setSavedPhone(next);
      setPhoneInput(next ? formatPhone(next) : '');
      setPhoneSaved(true);
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : t('alimtalk.saveFailed'));
    } finally {
      setPhoneBusy(false);
    }
  };

  const hasPhone = savedPhone.length > 0;
  const needPhoneHint = optIn && !hasPhone;

  return (
    <div className="space-y-3">
      {/* 카카오 알림톡 수신 동의 토글 */}
      <div className="rounded-xl bg-gray-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <ChatIcon className="h-4 w-4" />{t('alimtalk.toggleLabel')}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">{t('alimtalk.toggleDescription')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={optIn}
            aria-label={t('alimtalk.toggleLabel')}
            onClick={toggle}
            disabled={busy}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
              optIn ? 'bg-primary' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                optIn ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {needPhoneHint ? (
          <p className="mt-2 text-[11px] leading-snug text-primary">
            {t('alimtalk.needPhoneHint')}
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-snug text-gray-400">
            {t('alimtalk.consentHint')}
          </p>
        )}
      </div>

      {/* 휴대폰번호 입력/저장 — 알림톡 발송·결제에 사용 */}
      <div className="rounded-xl bg-gray-50 p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <SmartphoneIcon className="h-4 w-4" />{t('alimtalk.phoneLabel')}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">
          {hasPhone ? t('alimtalk.phoneRegistered', { phone: maskPhone(savedPhone) }) : t('alimtalk.phoneUsageHint')}
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(e.target.value);
              if (phoneError) setPhoneError('');
              if (phoneSaved) setPhoneSaved(false);
            }}
            placeholder={t('alimtalk.phonePlaceholder')}
            maxLength={13}
            aria-invalid={phoneError ? true : undefined}
            aria-label={t('alimtalk.phoneLabel')}
            className={`min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 ${
              phoneError
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                : 'border-gray-200 focus:border-primary focus:ring-primary'
            }`}
          />
          <button
            type="button"
            onClick={savePhone}
            disabled={phoneBusy}
            className="shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phoneBusy ? t('alimtalk.savingLabel') : t('saveAction')}
          </button>
        </div>
        {phoneError ? (
          <p className="mt-1 text-[11px] leading-tight text-red-500">{phoneError}</p>
        ) : phoneSaved ? (
          <p className="mt-1 text-[11px] leading-tight text-green-600">{t('alimtalk.savedConfirmation')}</p>
        ) : (
          <p className="mt-1 text-[11px] leading-tight text-gray-400">
            {t('alimtalk.clearHint')}
          </p>
        )}
      </div>
    </div>
  );
}

/** 표시용 마스킹: 가운데 자리를 가린다(예: 010-****-5678). */
function maskPhone(digits: string): string {
  if (/^01[016789][0-9]{8}$/.test(digits)) return `${digits.slice(0, 3)}-****-${digits.slice(7)}`;
  if (/^01[016789][0-9]{7}$/.test(digits)) return `${digits.slice(0, 3)}-***-${digits.slice(6)}`;
  return digits;
}
