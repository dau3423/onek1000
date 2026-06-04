'use client';

import { useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { StarRating } from './StarRating';
import { REVIEW_CONTENT_MAX, REVIEW_PHOTO_MAX, REVIEW_PHOTO_BYTE_MAX } from '@/types/review';

interface Props {
  stationId: string;
  onCreated?: () => void;
  onCancel?: () => void;
}

interface UploadedPhoto {
  path: string;
  signedUrl: string;
}

export function ReviewForm({ stationId, onCreated, onCancel }: Props) {
  const { status } = useSession();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'authenticated') {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center">
        <p className="text-sm text-gray-600">리뷰를 작성하려면 로그인이 필요해요.</p>
        <button
          onClick={() => signIn(undefined, { callbackUrl: `/station/${encodeURIComponent(stationId)}` })}
          className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white"
        >
          로그인
        </button>
      </div>
    );
  }

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (photos.length + files.length > REVIEW_PHOTO_MAX) {
      setError(`사진은 최대 ${REVIEW_PHOTO_MAX}장까지 올릴 수 있어요.`);
      return;
    }
    for (const f of files) {
      if (f.size > REVIEW_PHOTO_BYTE_MAX) {
        setError(`${f.name} — 5MB 초과`);
        return;
      }
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('photos', f);
      const res = await fetch('/api/upload/photo', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json() as { uploaded: UploadedPhoto[]; errors: string[] };
      setPhotos((prev) => [...prev, ...json.uploaded]);
      if (json.errors?.length) setError(json.errors.join(', '));
    } catch (e) {
      setError('업로드 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = (path: string) => {
    setPhotos((prev) => prev.filter((p) => p.path !== path));
  };

  const submit = async () => {
    if (busy) return;
    if (content.trim().length === 0 && photos.length === 0) {
      setError('내용 또는 사진 중 하나 이상은 입력해주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/stations/${stationId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          content: content.trim(),
          photoPaths: photos.map((p) => p.path),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      // 초기화 + 부모에 알림
      setContent('');
      setPhotos([]);
      setRating(5);
      onCreated?.();
      router.refresh();
    } catch (e) {
      setError('작성 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">별점</span>
        <StarRating value={rating} onChange={setRating} size="md" />
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, REVIEW_CONTENT_MAX))}
        placeholder="다녀온 경험을 짧게 남겨주세요 (선택)"
        rows={4}
        className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
        <span>{content.length} / {REVIEW_CONTENT_MAX}</span>
        <span>사진 {photos.length} / {REVIEW_PHOTO_MAX}</span>
      </div>

      {photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.path} className="relative h-16 w-16 overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.signedUrl} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => removePhoto(p.path)}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white hover:bg-black/80"
                aria-label="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || photos.length >= REVIEW_PHOTO_MAX}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          📷 {uploading ? '업로드 중…' : '사진 추가'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={onPickFiles}
          className="hidden"
        />
        <div className="flex-1" />
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50"
          >
            취소
          </button>
        )}
        <button
          onClick={submit}
          disabled={busy || uploading}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60"
        >
          {busy ? '등록 중…' : '리뷰 등록'}
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
