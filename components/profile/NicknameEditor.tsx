'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { NICKNAME_MAX, NICKNAME_MIN, validateNickname } from '@/lib/nickname';

interface Props {
  /** 서버에서 조회한 현재 닉네임(없으면 세션 폴백) */
  initialNickname?: string | null;
}

export function NicknameEditor({ initialNickname }: Props) {
  // 변경 저장 후 세션 닉네임을 즉시 반영(헤더/마이페이지 표시 갱신)
  const { update } = useSession();
  const [current, setCurrent] = useState<string>(initialNickname ?? '');
  const [value, setValue] = useState<string>(initialNickname ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // 초기 닉네임이 없으면(기존 사용자 폴백) 서버에서 한 번 조회
  useEffect(() => {
    if (initialNickname) return;
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.nickname === 'string') {
          setCurrent(d.nickname);
          setValue(d.nickname);
        }
      })
      .catch(() => {});
  }, [initialNickname]);

  const save = async () => {
    setErr(null);
    setOk(null);
    const v = validateNickname(value);
    if (!v.ok) return setErr(v.error ?? '닉네임을 확인해 주세요.');
    if (v.value === current) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: v.value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '변경에 실패했어요.');
      setCurrent(d.nickname);
      setValue(d.nickname);
      setEditing(false);
      setOk('닉네임을 변경했어요.');
      await update(); // 세션 갱신 → 헤더/표시 즉시 반영
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setValue(current);
    setEditing(false);
    setErr(null);
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
        <div>
          <div className="text-xs text-gray-500">닉네임</div>
          <div className="font-semibold text-gray-900">{current || '닉네임 없음'}</div>
          {ok && <div className="mt-0.5 text-xs text-primary">{ok}</div>}
        </div>
        <button
          onClick={() => {
            setEditing(true);
            setOk(null);
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          변경
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-gray-50 p-4">
      <label className="text-xs text-gray-500" htmlFor="nickname-input">
        새 닉네임 ({NICKNAME_MIN}~{NICKNAME_MAX}자, 한글·영문·숫자)
      </label>
      <input
        id="nickname-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={NICKNAME_MAX}
        placeholder="닉네임"
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
      />

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
        <button
          onClick={cancel}
          disabled={busy}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 disabled:opacity-60"
        >
          취소
        </button>
      </div>
    </div>
  );
}
