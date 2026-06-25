// Cron — "어제자 전국 최저가 TOP10" 트위터(X) 스레드 자동발행.
// Authorization: Bearer ${CRON_SECRET} (sync-opinet 과 동일 인증).
// X 미설정이면 발행 skip + 콘텐츠 미리보기 반환. 데이터 0건이면 발행 안 함.

import { NextResponse } from 'next/server';
import { buildDailyTop10Content } from '@/lib/content/dailyTop10';
import { postThread, isXConfigured } from '@/lib/social/xClient';
import { redis, keys } from '@/lib/cache/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 멱등키 TTL(3일). 같은 날짜 재실행을 막기에 충분하고, 오래된 기록은 자동 소멸.
const POSTED_TTL_SEC = 259200;

interface PostedRecord {
  date: string;
  tweetIds: string[];
  partial?: boolean;
}

export async function GET(req: Request) { return POST(req); }

export async function POST(req: Request) {
  // [W1] CRON_SECRET 빈값 가드 — 미설정 시 무조건 401(Bearer undefined 우회 차단).
  const secret = process.env.CRON_SECRET ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (secret.length === 0 || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const content = await buildDailyTop10Content();

    // 데이터가 전혀 없으면(어떤 유종도 TOP10 0건) 발행하지 않는다.
    const hasData = Object.values(content.products).some((p) => p.items.length > 0);
    if (!hasData) {
      return NextResponse.json({ posted: false, reason: 'no data', date: content.date });
    }

    if (!isXConfigured()) {
      return NextResponse.json({
        posted: false,
        reason: 'X not configured',
        date: content.date,
        preview: content.tweetThread,
      });
    }

    // [W2] 멱등성 — 같은 날짜에 이미 발행됐으면 재발행하지 않는다.
    // Redis 미설정 시 getJson 은 null 을 반환하므로 멱등 보장은 안 됨(아래 set 도 no-op).
    const postedKey = keys.dailyTweet(content.date);
    const prior = await redis.getJson<PostedRecord>(postedKey);
    if (prior) {
      return NextResponse.json({
        posted: false,
        reason: 'already posted',
        date: content.date,
        tweetIds: prior.tweetIds,
      });
    }

    const { ids: tweetIds, error } = await postThread(content.tweetThread);

    // 최소 1건이라도 성공 발행됐으면 멱등키에 기록(중복 발행 방지).
    // 완전 실패(0건)면 기록하지 않아 재시도를 허용한다.
    const partial = Boolean(error);
    if (tweetIds.length > 0) {
      const record: PostedRecord = { date: content.date, tweetIds, partial };
      await redis.setJson(postedKey, record, POSTED_TTL_SEC);
    }

    if (error) {
      // 부분 실패: 성공분 id 를 응답/로그에 보존. 0건이면 5xx, 일부 성공이면 안내.
      console.error(`[post-daily-tweet] partial failure: ${error} (posted ${tweetIds.length})`);
      return NextResponse.json(
        {
          posted: tweetIds.length > 0,
          reason: tweetIds.length > 0 ? 'partial failure' : 'post failed',
          error,
          date: content.date,
          tweetIds,
        },
        { status: tweetIds.length > 0 ? 207 : 500 },
      );
    }

    return NextResponse.json({ posted: true, tweetIds, date: content.date });
  } catch (e) {
    return NextResponse.json({ posted: false, error: (e as Error).message }, { status: 500 });
  }
}
