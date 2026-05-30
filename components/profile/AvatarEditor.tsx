'use client';

import { useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { REVIEW_PHOTO_BYTE_MAX } from '@/types/review';

interface Props {
  /** 서버에서 조회한 현재 프로필 사진(없으면 세션/기본 아바타) */
  initialImage?: string | null;
  /** 이니셜 폴백용 표시 이름 */
  displayName?: string | null;
}

export function AvatarEditor({ initialImage, displayName }: Props) {
  // 변경 저장 후 세션 image를 즉시 반영(헤더/마이페이지 표시 갱신)
  const { update } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(initialImage ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setErr('이미지 파일만 올릴 수 있어요.');
    if (file.size > REVIEW_PHOTO_BYTE_MAX) return setErr('사진 용량은 5MB 이하만 가능해요.');

    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await fetch('/api/profile', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '업로드에 실패했어요.');
      setImage(d.image ?? null);
      await update(); // 세션 갱신 → 헤더/표시 즉시 반영
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetImage: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '변경에 실패했어요.');
      setImage(d.image ?? null);
      await update();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const initial = displayName?.trim()?.[0] ?? '·';

  return (
    <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4">
      <div className="relative h-16 w-16 shrink-0">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt="프로필 사진"
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl font-bold text-gray-500">
            {initial}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-500">프로필 사진</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {busy ? '처리 중…' : '사진 변경'}
          </button>
          {image && (
            <button
              onClick={reset}
              disabled={busy}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 disabled:opacity-60"
            >
              기본으로
            </button>
          )}
        </div>
        {err && <p className="mt-1.5 text-xs text-red-500">{err}</p>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onPick}
        className="hidden"
      />
    </div>
  );
}
