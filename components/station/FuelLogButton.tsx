'use client';

// 주유소 상세 "여기서 주유" 1클릭 저장 버튼.
// 비로그인 시 signIn 유도. 누르면 POST(/api/fuel-logs) → 성공 시 안내 문구 노출.
// 단가/유종/시각은 서버가 보강하므로 클라이언트는 stationId만 보낸다.
import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';

interface Props {
  stationId: string;
  className?: string;
}

type State = 'idle' | 'busy' | 'done';

export function FuelLogButton({ stationId, className }: Props) {
  const { status } = useSession();
  const [state, setState] = useState<State>('idle');
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (status !== 'authenticated') {
      signIn(undefined, { callbackUrl: `/station/${stationId}` });
      return;
    }
    setState('busy');
    setErr(null);
    try {
      const res = await fetch('/api/fuel-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? '저장에 실패했어요.');
      setState('done');
      // 잠깐 완료 표시 후 다시 저장 가능 상태로 (재방문/연속 주유 대비)
      window.setTimeout(() => setState('idle'), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState('idle');
    }
  };

  return (
    <div>
      <button
        onClick={save}
        disabled={state === 'busy'}
        className={
          className ??
          'block w-full rounded-xl bg-primary py-3.5 text-center font-bold text-white disabled:opacity-60'
        }
      >
        {state === 'busy' ? '저장 중…' : state === 'done' ? '✓ 주유 기록 저장됨' : '⛽ 여기서 주유'}
      </button>
      {state === 'done' && (
        <p className="mt-1.5 text-center text-xs text-gray-500 dark:text-gray-400">
          마이페이지 &gt; 주유 기록에서 금액·주유량을 편집할 수 있어요.
        </p>
      )}
      {err && <p className="mt-1.5 text-center text-xs text-red-500">{err}</p>}
    </div>
  );
}
