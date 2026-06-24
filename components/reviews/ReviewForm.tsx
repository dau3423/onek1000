'use client';

import { useMemo, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { StarRating } from './StarRating';
import {
  REVIEW_CONTENT_MAX,
  REVIEW_PHOTO_MAX,
  REVIEW_PHOTO_BYTE_MAX,
  REVIEW_GEOFENCE_M,
  REVIEW_GEOFENCE_ACCURACY_CAP_M,
} from '@/types/review';
import { useGeolocation } from '@/hooks/useGeolocation';
import { distanceMeters } from '@/lib/map/geo';

interface Props {
  stationId: string;
  /** 주유소 좌표 — 있으면 작성 전에 클라이언트가 거리를 미리 보여주고 차단(서버가 최종 검증). */
  stationLat?: number;
  stationLng?: number;
  onCreated?: () => void;
  onCancel?: () => void;
}

interface UploadedPhoto {
  path: string;
  signedUrl: string;
}

/** 거리 표기: 1km 미만은 m, 이상은 km. */
function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

export function ReviewForm({ stationId, stationLat, stationLng, onCreated, onCancel }: Props) {
  const { status } = useSession();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // 리뷰 작성 폼이 열리면 위치 추적 시작(지오펜스 검증용). 권한 프롬프트는 이 시점에 자연스럽게 노출.
  const geo = useGeolocation(true);

  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 현재 위치 ↔ 주유소 거리 + 작성 가능 여부(주유소 좌표가 있을 때만 사전 판정).
  const allowedM =
    REVIEW_GEOFENCE_M +
    Math.min(geo.coords?.accuracy && geo.coords.accuracy > 0 ? geo.coords.accuracy : 0, REVIEW_GEOFENCE_ACCURACY_CAP_M);
  const distanceM = useMemo(() => {
    if (stationLat == null || stationLng == null || !geo.coords) return null;
    return distanceMeters(geo.coords.lat, geo.coords.lng, stationLat, stationLng);
  }, [geo.coords, stationLat, stationLng]);
  const tooFar = distanceM != null && distanceM > allowedM;
  // 작성 가능: 위치 좌표가 있고(필수) + (주유소 좌표를 알 땐) 반경 이내.
  const locationReady = !!geo.coords && !tooFar;

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
    // 지오펜스: 위치가 없거나 주유소에서 멀면 작성 차단(서버도 동일 검증).
    if (!geo.coords) {
      setError('리뷰는 주유소 근처에서만 작성할 수 있어요. 위치를 허용해 주세요.');
      return;
    }
    if (tooFar && distanceM != null) {
      setError(`주유소에서 약 ${fmtDist(distanceM)} 떨어져 있어요. 주유소 근처에서 작성해 주세요.`);
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
          lat: geo.coords.lat,
          lng: geo.coords.lng,
          accuracy: geo.coords.accuracy,
        }),
      });
      if (!res.ok) {
        // 서버 검증 실패 메시지를 사용자 친화적으로 변환.
        let msg = '작성에 실패했어요. 잠시 후 다시 시도해 주세요.';
        try {
          const j = await res.json();
          if (j?.code === 'too_far') {
            msg = `주유소에서 약 ${fmtDist(j.distanceM ?? 0)} 떨어져 있어요. 주유소 근처에서 작성해 주세요.`;
          } else if (j?.code === 'location_required') {
            msg = '위치 확인이 필요해요. 위치를 허용한 뒤 다시 시도해 주세요.';
          } else if (typeof j?.error === 'string') {
            msg = j.error;
          }
        } catch {
          /* JSON 아님 — 기본 메시지 사용 */
        }
        throw new Error(msg);
      }
      // 초기화 + 부모에 알림
      setContent('');
      setPhotos([]);
      setRating(5);
      onCreated?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

      {/* 지오펜스 상태 안내 — 리뷰는 주유소 근처에서만 작성 가능 */}
      <div className="mt-3">
        {geo.status === 'denied' ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            <span>📍 위치 권한이 필요해요. 주유소 근처에서 위치를 허용해 주세요.</span>
            <button
              onClick={geo.request}
              className="shrink-0 rounded-md border border-amber-300 px-2 py-1 font-semibold hover:bg-amber-100"
            >
              다시 시도
            </button>
          </div>
        ) : geo.status === 'unavailable' ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            📍 이 기기에서 위치를 사용할 수 없어 리뷰를 작성할 수 없어요.
          </div>
        ) : !geo.coords ? (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
            📍 현재 위치 확인 중…
          </div>
        ) : tooFar && distanceM != null ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            📍 주유소에서 약 {fmtDist(distanceM)} 떨어져 있어요. 주유소 근처(약 {REVIEW_GEOFENCE_M}m 이내)에서 작성할 수 있어요.
          </div>
        ) : distanceM != null ? (
          <div className="rounded-lg bg-green-50 px-3 py-2 text-[11px] text-green-700">
            ✓ 주유소 근처예요 (약 {fmtDist(distanceM)}). 리뷰를 작성할 수 있어요.
          </div>
        ) : (
          <div className="rounded-lg bg-green-50 px-3 py-2 text-[11px] text-green-700">
            ✓ 위치 확인 완료. 리뷰를 작성할 수 있어요.
          </div>
        )}
      </div>

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
          disabled={busy || uploading || !locationReady}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60"
        >
          {busy ? '등록 중…' : '리뷰 등록'}
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
