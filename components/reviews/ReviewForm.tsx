'use client';

import { useMemo, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { PinIcon, CheckIcon, CameraIcon, CloseIcon } from '@/components/icons';
import type { PlaceType } from '@/types/review';

interface Props {
  targetType: PlaceType;
  targetId: string;
  /** 대상 장소 좌표 — 있으면 작성 전에 클라이언트가 거리를 미리 보여주고 차단(서버가 최종 검증). */
  lat?: number;
  lng?: number;
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

export function ReviewForm({ targetType, targetId, lat, lng, onCreated, onCancel }: Props) {
  const t = useTranslations('review');
  const tCommon = useTranslations('common');
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

  // 현재 위치 ↔ 대상 장소 거리 + 작성 가능 여부(대상 좌표가 있을 때만 사전 판정).
  const allowedM =
    REVIEW_GEOFENCE_M +
    Math.min(geo.coords?.accuracy && geo.coords.accuracy > 0 ? geo.coords.accuracy : 0, REVIEW_GEOFENCE_ACCURACY_CAP_M);
  const distanceM = useMemo(() => {
    if (lat == null || lng == null || !geo.coords) return null;
    return distanceMeters(geo.coords.lat, geo.coords.lng, lat, lng);
  }, [geo.coords, lat, lng]);
  const tooFar = distanceM != null && distanceM > allowedM;
  // 작성 가능: 위치 좌표가 있고(필수) + (대상 좌표를 알 땐) 반경 이내.
  const locationReady = !!geo.coords && !tooFar;

  if (status !== 'authenticated') {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center">
        <p className="text-sm text-gray-600">{t('loginRequired')}</p>
        <button
          onClick={() => signIn(undefined, { callbackUrl: `/station/${encodeURIComponent(targetId)}` })}
          className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white"
        >
          {t('login')}
        </button>
      </div>
    );
  }

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (photos.length + files.length > REVIEW_PHOTO_MAX) {
      setError(t('photoMaxError', { max: REVIEW_PHOTO_MAX }));
      return;
    }
    for (const f of files) {
      if (f.size > REVIEW_PHOTO_BYTE_MAX) {
        setError(t('photoTooLarge', { name: f.name }));
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
      setError(t('uploadFailed', { message: e instanceof Error ? e.message : String(e) }));
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
      setError(t('contentOrPhotoRequired'));
      return;
    }
    // 지오펜스: 위치가 없거나 주유소에서 멀면 작성 차단(서버도 동일 검증).
    if (!geo.coords) {
      setError(t('locationRequired', { type: targetType }));
      return;
    }
    if (tooFar && distanceM != null) {
      setError(t('tooFar', { type: targetType, distance: fmtDist(distanceM) }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/places/${targetType}/${targetId}/reviews`, {
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
        let msg = t('submitFailed');
        try {
          const j = await res.json();
          if (j?.code === 'too_far') {
            msg = t('tooFar', { type: targetType, distance: fmtDist(j.distanceM ?? 0) });
          } else if (j?.code === 'location_required') {
            msg = t('locationCheckRequired');
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
        <span className="text-sm font-bold text-gray-800">{t('ratingLabel')}</span>
        <StarRating value={rating} onChange={setRating} size="md" />
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, REVIEW_CONTENT_MAX))}
        placeholder={t('placeholder')}
        rows={4}
        className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-white"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
        <span>{content.length} / {REVIEW_CONTENT_MAX}</span>
        <span>{t('photoCount', { count: photos.length, max: REVIEW_PHOTO_MAX })}</span>
      </div>

      {photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.path} className="relative h-16 w-16 overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.signedUrl} alt="" className="h-full w-full object-cover" />
              {/* 초소형 예외(§4-2): 64px 썸네일 내라 44/40px 히트영역 불가 → h-7 w-7(28px)로 확대 상한. */}
              <button
                onClick={() => removePhoto(p.path)}
                className="absolute right-0.5 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label={t('deletePhotoAria')}
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 지오펜스 상태 안내 — 리뷰는 주유소 근처에서만 작성 가능 */}
      <div className="mt-3">
        {geo.status === 'denied' ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            <span className="flex items-start gap-1">
              <PinIcon className="mt-px h-3.5 w-3.5 shrink-0" />
              {t('locationPermissionNeeded', { type: targetType })}
            </span>
            <button
              onClick={geo.request}
              className="shrink-0 rounded-md border border-amber-300 px-2 py-1 font-semibold hover:bg-amber-100"
            >
              {tCommon('retry')}
            </button>
          </div>
        ) : geo.status === 'unavailable' ? (
          <div className="flex items-start gap-1 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            <PinIcon className="mt-px h-3.5 w-3.5 shrink-0" />
            {t('locationUnavailable')}
          </div>
        ) : !geo.coords ? (
          <div className="flex items-start gap-1 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
            <PinIcon className="mt-px h-3.5 w-3.5 shrink-0" />
            {t('locating')}
          </div>
        ) : tooFar && distanceM != null ? (
          <div className="flex items-start gap-1 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            <PinIcon className="mt-px h-3.5 w-3.5 shrink-0" />
            {t('tooFarDetail', { type: targetType, distance: fmtDist(distanceM), radius: REVIEW_GEOFENCE_M })}
          </div>
        ) : distanceM != null ? (
          <div className="flex items-start gap-1 rounded-lg bg-green-50 px-3 py-2 text-[11px] text-green-700">
            <CheckIcon className="mt-px h-3.5 w-3.5 shrink-0" />
            {t('near', { type: targetType, distance: fmtDist(distanceM) })}
          </div>
        ) : (
          <div className="flex items-start gap-1 rounded-lg bg-green-50 px-3 py-2 text-[11px] text-green-700">
            <CheckIcon className="mt-px h-3.5 w-3.5 shrink-0" />
            {t('locationConfirmed')}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || photos.length >= REVIEW_PHOTO_MAX}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <CameraIcon className="h-4 w-4" />
          {uploading ? t('uploading') : t('addPhoto')}
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
            {tCommon('cancel')}
          </button>
        )}
        <button
          onClick={submit}
          disabled={busy || uploading || !locationReady}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60"
        >
          {busy ? t('submitting') : t('submit')}
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
