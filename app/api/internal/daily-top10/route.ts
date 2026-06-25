// "어제자 전국 최저가 TOP10" 블로그 복붙용 API.
// 브라우저에서 URL로 열어 마크다운/트윗을 통째로 복사해 쓰기 위한 라우트.
//
// 인증: Authorization: Bearer ${CRON_SECRET}  또는  ?secret=${CRON_SECRET} 둘 중 하나 일치.
//   (브라우저 주소창에서 열려면 헤더를 못 넣으므로 쿼리 시크릿도 허용)
// 쿼리:
//   format = md(기본) | json
//   products = 'B027,D047' 처럼 콤마 구분 (옵션)
//   date = 'YYYY-MM-DD' (옵션)

import { NextResponse } from 'next/server';
import { buildDailyTop10Content } from '@/lib/content/dailyTop10';
import type { ProductCode } from '@/types/station';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PRODUCTS: ProductCode[] = ['B027', 'B034', 'D047', 'K015', 'C004'];

function parseProducts(raw: string | null): ProductCode[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ProductCode => (VALID_PRODUCTS as string[]).includes(s));
  return list.length ? list : undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  const querySecret = url.searchParams.get('secret') ?? '';
  const authorized = auth === `Bearer ${secret}` || (secret.length > 0 && querySecret === secret);
  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const format = (url.searchParams.get('format') ?? 'md').toLowerCase();
  const products = parseProducts(url.searchParams.get('products'));
  const date = url.searchParams.get('date') ?? undefined;

  let content;
  try {
    content = await buildDailyTop10Content({ products, date });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  if (format === 'json') {
    return NextResponse.json(content);
  }

  // md: 블로그 마크다운 + 트윗(단일/스레드)을 한 덩어리로 — 복사해서 바로 쓰기 쉽게.
  const text =
    content.blogMarkdown +
    '\n\n---\n\n[단일 트윗]\n' +
    content.tweetSingle +
    '\n\n[스레드]\n' +
    content.tweetThread.join('\n---\n');

  return new NextResponse(text, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
