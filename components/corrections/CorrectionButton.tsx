'use client';

// 정보 제보(정정 요청) 버튼 + 입력 모달 — 정비소 브랜드 / 주유소 유가 공용.
//
// 왜 한 컴포넌트인가: 두 제보는 입력 필드만 다르고 나머지(로그인 게이트, 선택 사진 업로드,
// 제출, 중복/미지원 처리, 완료 안내)가 전부 같다. 나누면 그 공통부를 두 벌 유지하게 된다.
//
// 접수된 제보는 **관리자 승인 전까지 어디에도 표시되지 않는다**. 사용자가 "제보했는데 왜 그대로지?"
// 라고 느끼지 않도록 완료 안내에서 그 사실을 분명히 말한다.

import { useEffect, useRef, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { requireLogin } from '@/lib/auth/gate';
import { useTranslations } from 'next-intl';
import { CameraIcon, CloseIcon, PencilIcon } from '@/components/icons';
import {
  CORRECTION_PHOTO_MAX,
  FUEL_PRICE_MAX,
  FUEL_PRICE_MIN,
  type CorrectionPayload,
} from '@/types/correction';
import { REVIEW_PHOTO_BYTE_MAX } from '@/types/review';
import { REPAIR_BRANDS, type RepairBrand } from '@/types/repair';
import type { ProductCode } from '@/types/station';

interface UploadedPhoto {
  path: string;
  signedUrl: string;
}

type Props =
  | {
      kind: 'repair_brand';
      targetId: string;
      /** 현재 지도·상세에 표시 중인 브랜드(없으면 null) — 무엇을 고치는 제보인지 보여준다. */
      currentBrand: RepairBrand | null;
      /** 로그인 후 돌아올 경로. */
      callbackUrl: string;
    }
  | {
      kind: 'fuel_price';
      targetId: string;
      /** 이 주유소가 실제로 공식 가격을 갖고 있는 유종만 — 없는 유종 제보는 어차피 표시되지 않는다. */
      products: ProductCode[];
      callbackUrl: string;
    };

export function CorrectionButton(props: Props) {
  const t = useTranslations('correction');
  const tCommon = useTranslations('common');
  const tLabels = useTranslations('labels');
  const tBrand = useTranslations('repair.brandLabel');
  const { status } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  // 정비소: 선택한 브랜드. '' = 미선택, 'none' = 브랜드 없음으로 정정.
  const [brand, setBrand] = useState<'' | 'none' | RepairBrand>('');
  // 주유소: 유종 + 가격.
  const [product, setProduct] = useState<ProductCode | ''>(
    props.kind === 'fuel_price' ? (props.products[0] ?? '') : '',
  );
  const [price, setPrice] = useState('');

  const close = () => {
    if (busy) return;
    setOpen(false);
    setDone(false);
    setError(null);
    setPhotos([]);
    setBrand('');
    setPrice('');
  };

  // ESC 로 닫기 — 제출 중에는 무시(리뷰 신고 모달과 동일 규약).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (photos.length + files.length > CORRECTION_PHOTO_MAX) {
      setError(t('photoMaxError', { max: CORRECTION_PHOTO_MAX }));
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
      // 리뷰와 같은 업로드 엔드포인트/버킷을 쓴다 — 사진 저장 규약을 두 벌 만들 이유가 없다.
      const res = await fetch('/api/upload/photo', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { uploaded: UploadedPhoto[]; errors: string[] };
      setPhotos((prev) => [...prev, ...json.uploaded]);
      if (json.errors?.length) setError(json.errors.join(', '));
    } catch (err) {
      console.error('[CorrectionButton] photo upload failed', err);
      setError(t('uploadFailed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = (path: string) => setPhotos((prev) => prev.filter((p) => p.path !== path));

  // 제출 가능 여부 — 종류별 필수 입력이 채워졌는지.
  const priceNum = Number(price);
  const priceOk =
    Number.isInteger(priceNum) && priceNum >= FUEL_PRICE_MIN && priceNum <= FUEL_PRICE_MAX;
  const canSubmit =
    props.kind === 'repair_brand' ? brand !== '' : product !== '' && priceOk;

  const submit = async () => {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const payload: CorrectionPayload =
        props.kind === 'repair_brand'
          ? { brand: brand === 'none' ? null : (brand as RepairBrand) }
          : { product: product as ProductCode, price: priceNum };

      const res = await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: props.kind,
          targetType: props.kind === 'repair_brand' ? 'repair' : 'gas',
          targetId: props.targetId,
          payload,
          photoPaths: photos.map((p) => p.path),
        }),
      });
      if (!res.ok) {
        let code: string | undefined;
        try {
          code = (await res.json())?.code;
        } catch {
          /* JSON 아님 — 일반 실패로 처리 */
        }
        if (res.status === 409 || code === 'duplicate') throw new Error(t('duplicate'));
        if (res.status === 503 || code === 'unavailable') throw new Error(t('unavailable'));
        throw new Error(t('failed'));
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const title = props.kind === 'repair_brand' ? t('repair.title') : t('fuel.title');
  const action = props.kind === 'repair_brand' ? t('repair.action') : t('fuel.action');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-gray-600 hover:underline"
      >
        <PencilIcon className="h-3 w-3" />
        {action}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={close}
        >
          <div
            className="max-h-[85dvh] w-full max-w-[360px] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {status !== 'authenticated' ? (
              // 로그인 필수 — 누가 제보했는지 남아야 반복 허위 제보를 막을 수 있다.
              <>
                <h2 className="mb-2 text-sm font-bold text-gray-900">{title}</h2>
                <p className="py-3 text-center text-sm text-gray-600">{t('loginRequired')}</p>
                <button
                  onClick={() => requireLogin('report', props.callbackUrl)}
                  className="w-full rounded-lg bg-primary py-2.5 text-xs font-bold text-white"
                >
                  {t('login')}
                </button>
                <button
                  onClick={close}
                  className="mt-2 w-full rounded-lg py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50"
                >
                  {tCommon('close')}
                </button>
              </>
            ) : done ? (
              <>
                <h2 className="mb-2 text-sm font-bold text-gray-900">{title}</h2>
                <p className="py-3 text-center text-sm text-gray-700">{t('done')}</p>
                <p className="pb-3 text-center text-[11px] leading-relaxed text-gray-500">
                  {t('doneHint')}
                </p>
                <button
                  onClick={close}
                  className="w-full rounded-lg bg-gray-100 py-2.5 text-xs font-semibold text-gray-700"
                >
                  {tCommon('close')}
                </button>
              </>
            ) : (
              <>
                <h2 className="text-sm font-bold text-gray-900">{title}</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                  {props.kind === 'repair_brand' ? t('repair.hint') : t('fuel.hint')}
                </p>

                {props.kind === 'repair_brand' ? (
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] font-semibold text-gray-500">
                      {t('repair.currentLabel')}:{' '}
                      <span className="font-normal text-gray-700">
                        {props.currentBrand ? tBrand(props.currentBrand) : tBrand('none')}
                      </span>
                    </p>
                    <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                      {t('repair.selectLabel')}
                    </label>
                    <select
                      value={brand}
                      onChange={(e) => setBrand(e.target.value as '' | 'none' | RepairBrand)}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-white"
                    >
                      <option value="">{t('repair.placeholder')}</option>
                      {REPAIR_BRANDS.map((b) => (
                        <option key={b} value={b}>
                          {tBrand(b)}
                        </option>
                      ))}
                      <option value="none">{t('repair.none')}</option>
                    </select>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                        {t('fuel.productLabel')}
                      </label>
                      <select
                        value={product}
                        onChange={(e) => setProduct(e.target.value as ProductCode)}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-white"
                      >
                        {props.products.map((p) => (
                          <option key={p} value={p}>
                            {tLabels(`product.${p}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                        {t('fuel.priceLabel')}
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={price}
                        min={FUEL_PRICE_MIN}
                        max={FUEL_PRICE_MAX}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder={t('fuel.pricePlaceholder')}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:bg-white"
                      />
                      {price !== '' && !priceOk && (
                        <p className="mt-1 text-[11px] text-red-500">
                          {t('fuel.priceRange', { min: FUEL_PRICE_MIN, max: FUEL_PRICE_MAX })}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 사진은 선택 — 관리자가 승인 판단할 근거(간판·가격판)로만 쓴다. */}
                <div className="mt-3">
                  <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                    {t('photoLabel', { max: CORRECTION_PHOTO_MAX })}
                  </label>
                  <p className="mb-2 text-[11px] leading-relaxed text-gray-400">
                    {props.kind === 'repair_brand' ? t('repair.photoHint') : t('fuel.photoHint')}
                  </p>
                  {photos.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {photos.map((p) => (
                        <div key={p.path} className="relative h-16 w-16 overflow-hidden rounded-lg">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.signedUrl} alt="" className="h-full w-full object-cover" />
                          {/* 초소형 예외(§4-2): 64px 썸네일 내라 44px 히트영역 불가 → 28px 상한(리뷰 폼과 동일). */}
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
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || photos.length >= CORRECTION_PHOTO_MAX}
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
                </div>

                {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    onClick={close}
                    disabled={busy}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    onClick={submit}
                    disabled={busy || !canSubmit || uploading}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60"
                  >
                    {busy ? t('submitting') : t('submit')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
