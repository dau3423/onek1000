// 사용자 제보(정정 요청) 접수 — POST /api/corrections
//
//  body { kind, targetType, targetId, payload, photoPaths? }
//    kind='repair_brand' → payload { brand: RepairBrand | null }   targetType='repair'
//    kind='fuel_price'   → payload { product: ProductCode, price } targetType='gas'
//
// 항상 status='pending' 으로 들어간다 — 승인 전에는 어떤 화면에도 노출되지 않는다.
// 로그인 필수: 누가 냈는지 남아야 반복 허위 제보를 막을 수 있다(설계 결정).
//
// 대상 존재 검증을 하는 이유: 존재하지 않는 shop_key/station_id 로 대기열을 채우는 장난을 막고,
// 관리자 화면에서 "대상 없음" 행을 보게 되는 일을 없앤다.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getSupabase, isSupabaseConfigured } from '@/lib/db/supabase';
import { createCorrection } from '@/lib/db/corrections';
import { isRepairBrand } from '@/types/repair';
import { PRODUCT_LABEL, type ProductCode } from '@/types/station';
import {
  CORRECTION_PHOTO_MAX,
  isValidFuelPrice,
  type CorrectionPayload,
} from '@/types/correction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 장소 id 형식 가드 — 리뷰 라우트와 같은 규약(과도한 길이/제어문자 차단). */
const ID_OK = /^[A-Za-z0-9_\-.:]{1,200}$/;

function bad(error: string, code?: string) {
  return NextResponse.json(code ? { error, code } : { error }, { status: 400 });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad('json body expected');
  }

  const targetId = String(body?.targetId ?? '').trim();
  if (!ID_OK.test(targetId)) return bad('invalid target id');

  // 종류별 payload 검증 — 여기서 통과한 모양만 DB 에 들어간다.
  let payload: CorrectionPayload;
  let targetType: 'gas' | 'repair';

  if (body?.kind === 'repair_brand') {
    targetType = 'repair';
    const brand = body?.payload?.brand ?? null;
    // null 은 '브랜드 없음으로 정정' — 유효한 제보다.
    if (brand !== null && !isRepairBrand(brand)) return bad('invalid brand');
    payload = { brand };
  } else if (body?.kind === 'fuel_price') {
    targetType = 'gas';
    const product = body?.payload?.product;
    if (typeof product !== 'string' || !(product in PRODUCT_LABEL)) return bad('invalid product');
    const price = body?.payload?.price;
    if (!isValidFuelPrice(price)) return bad('invalid price', 'price_range');
    payload = { product: product as ProductCode, price };
  } else {
    return bad('invalid kind');
  }

  if (body?.targetType && body.targetType !== targetType) return bad('target type mismatch');

  // 사진은 선택. 업로드는 /api/upload/photo 가 이미 마쳤고 여기 오는 건 storage 경로뿐이다.
  const rawPaths: unknown = body?.photoPaths;
  const photoPaths = (Array.isArray(rawPaths) ? rawPaths : [])
    .filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length <= 300)
    .slice(0, CORRECTION_PHOTO_MAX);

  if (!isSupabaseConfigured()) {
    // mock 모드: 접수된 척만 하고 저장하지 않는다(로컬 개발에서 폼 동작 확인용).
    return NextResponse.json({ ok: true, id: 'mock-correction', mock: true });
  }

  const sb = getSupabase();

  // 대상 존재 확인.
  const table = targetType === 'repair' ? 'repair_shops' : 'stations';
  const keyCol = targetType === 'repair' ? 'shop_key' : 'id';
  const { data: target, error: targetError } = await sb
    .from(table)
    .select(keyCol)
    .eq(keyCol, targetId)
    .maybeSingle();
  // targetError 는 테이블 자체가 없는 경우(정비소 미마이그레이션) — 존재 확인을 건너뛰지 않고 거절한다.
  if (targetError || !target) {
    return NextResponse.json({ error: 'target not found' }, { status: 404 });
  }

  const { data: user } = await sb
    .from('users')
    .select('id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const result = await createCorrection({
    kind: body.kind,
    targetType,
    targetId,
    userId: user.id as string,
    payload,
    photoPaths,
  });

  if (!result.ok) {
    if (result.code === 'duplicate') {
      return NextResponse.json({ error: 'already reported', code: 'duplicate' }, { status: 409 });
    }
    if (result.code === 'unavailable') {
      return NextResponse.json({ error: 'not available', code: 'unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: result.message ?? 'failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: result.id });
}
