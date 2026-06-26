// "어제자 전국 최저가 TOP10" 일일 콘텐츠 생성기.
// 블로그(복붙용 마크다운) + 트위터(단일/스레드)를 한 번에 만든다.
// 데이터 소스: queryNationalTop10Detailed(DB/mock) + fetchNationalAvg(오피넷 공식 평균).
// 외부 호출 실패에 강건하게: 데이터 0건/평균 null 이어도 throw 하지 않고 안내 텍스트를 채운다.

import { queryDailyTop10 } from '@/lib/db/queries';
import { fetchNationalAvg } from '@/lib/opinet/client';
import { PRODUCT_LABEL, BRAND_LABEL, SIDO_NAME, type ProductCode, type DailyTop10Item } from '@/types/station';

const APP_URL = 'onek1000.kr';
const DEFAULT_PRODUCTS: ProductCode[] = ['B027', 'D047']; // 휘발유, 경유

export interface DailyTop10Content {
  date: string; // "YYYY. M. D." (한국식)
  products: Record<ProductCode, { label: string; items: DailyTop10Item[]; avg: number | null }>;
  blogMarkdown: string;
  tweetSingle: string;
  tweetThread: string[];
}

// ─────────────────────────────────────────────
// 날짜 헬퍼
// ─────────────────────────────────────────────

/** KST(UTC+9) 기준 어제 날짜를 YYYY-MM-DD 로 */
function yesterdayKstIso(): string {
  const nowKstMs = Date.now() + 9 * 60 * 60 * 1000; // UTC → KST
  const y = new Date(nowKstMs - 24 * 60 * 60 * 1000);
  return y.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "YYYY. M. D." (한국식). 파싱 실패 시 원본 반환. */
function formatKoreanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.`;
}

const won = (n: number) => n.toLocaleString('ko-KR');

const RANK_EMOJI: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

// ─────────────────────────────────────────────
// 블로그 마크다운
// ─────────────────────────────────────────────

function blogTableRow(it: DailyTop10Item): string {
  const rankCell = RANK_EMOJI[it.rank] ? `${RANK_EMOJI[it.rank]} ${it.rank}` : String(it.rank);
  const self = it.isSelf ? '셀프' : '-';
  const region = SIDO_NAME[it.sido] ?? it.sido;
  return `| ${rankCell} | ${region} | ${it.name} | ${BRAND_LABEL[it.brand] ?? it.brand} | ${won(it.price)} | ${self} |`;
}

function blogSection(label: string, items: DailyTop10Item[], avg: number | null, date: string): string {
  if (items.length === 0) {
    return `### 🏆 전국 ${label} 최저가 TOP10 (${date} 기준)\n\n> 해당 날짜의 ${label} 데이터가 아직 집계되지 않았습니다.\n`;
  }
  const header =
    `### 🏆 전국 ${label} 최저가 TOP10 (${date} 기준)\n\n` +
    `| 순위 | 지역 | 주유소 | 브랜드 | 가격(원/L) | 셀프 |\n` +
    `|:---:|:---|:---|:---|---:|:---:|\n`;
  const rows = items.map(blogTableRow).join('\n');
  let comment = '';
  const top = items[0];
  if (avg != null) {
    const diff = avg - top.price;
    if (diff > 0) {
      comment =
        `\n\n> 전국 평균 ${won(avg)}원 대비 1위는 리터당 ${won(diff)}원 저렴 ` +
        `(50L 가득 시 약 ${won(diff * 50)}원 차이)`;
    } else {
      comment = `\n\n> 전국 평균 ${won(avg)}원 기준 (오피넷)`;
    }
  }
  return header + rows + comment + '\n';
}

function buildBlogMarkdown(
  date: string,
  sections: Array<{ label: string; items: DailyTop10Item[]; avg: number | null }>,
): string {
  const firstWithItems = sections.find((s) => s.items.length > 0);
  const title = `# 오늘의 전국 주유소 최저가 TOP10 (${date} 기준)`;
  const intro =
    `${date} 기준, 전국에서 가장 싸게 주유할 수 있는 주유소 **TOP10**을 유종별로 정리했습니다.\n` +
    `데이터는 한국석유공사 **오피넷** 가격 기준입니다.`;

  const body = sections.map((s) => blogSection(s.label, s.items, s.avg, date)).join('\n\n');

  const cta =
    `### ⛽ 내 주변 최저가는 1000냥 주유소로\n\n` +
    `전국 최저가까지 갈 필요 없이, **내 주변에서 제일 싼 곳**만 찾아도 충분히 절약됩니다.\n` +
    `[**1000냥 주유소**](https://${APP_URL})는 전국 주유소 실시간 가격을 지도로 보여주고, ` +
    `내 주변·경로 위의 최저가를 자동으로 찾아줍니다.\n\n` +
    `- 🗺️ 지도 줌만 하면 그 영역 최저가 자동 정렬\n` +
    `- 📍 내 주변 평균보다 싼 곳이 있으면 자동 알림\n` +
    `- 🛣️ 출발지→도착지 경로 위 최저가 주유소 추천\n\n` +
    `👉 ${APP_URL}\n\n` +
    `\`#기름값 #주유소 #최저가주유소 #주유비절약\`\n\n` +
    `> 가격은 발행 시점(${date}) 오피넷 기준이며 실시간으로 변동될 수 있습니다.\n` +
    `> 데이터 제공: 한국석유공사 오피넷`;

  // 데이터가 전무하면 표 대신 안내만.
  if (!firstWithItems) {
    return `${title}\n\n오늘은 집계된 최저가 데이터가 없습니다. 잠시 후 다시 확인해 주세요.\n\n${cta}`;
  }
  return `${title}\n\n${intro}\n\n${body}\n\n${cta}`;
}

// ─────────────────────────────────────────────
// 트위터
// ─────────────────────────────────────────────

// 한글 가중치를 고려해 트윗 길이를 대략 추정한다. X는 한글 1자 ≈ 2 weighted chars,
// 280 weighted limit → 한글 기준 ~140자. URL은 23자로 고정 계산.
function tweetWeight(text: string): number {
  // URL(https?://... 또는 도메인.kr)을 23 가중치로 치환 후 계산
  const urlReplaced = text.replace(/https?:\/\/\S+/g, '#'.repeat(23));
  let w = 0;
  for (const ch of urlReplaced) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK/전각/한글 영역은 가중치 2, 그 외 1
    w += code > 0x1100 ? 2 : 1;
  }
  return w;
}

const TWEET_LIMIT = 280;

/** TOP 항목 1줄 — 상호 포함. tooLong이면 지역만(상호 생략). */
function tweetLine(it: DailyTop10Item, emoji: string, withName: boolean): string {
  const region = SIDO_NAME[it.sido] ?? it.sido;
  const place = withName ? `${region} ${it.name}` : region;
  return `${emoji} ${won(it.price)}원 · ${place}`;
}

const NUM_EMOJI = ['', '🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * 항목 목록을 줄로 렌더하되, header+lines+footer 합산 가중치가 limit 이내가 되도록
 * 필요하면 상호를 생략(지역만)한다. 그래도 길면 항목 수를 줄인다.
 */
function fitTweet(header: string, items: DailyTop10Item[], footer: string, limit = TWEET_LIMIT): string {
  const render = (withName: boolean, count: number) => {
    const lines = items.slice(0, count).map((it) => tweetLine(it, NUM_EMOJI[it.rank] ?? `${it.rank}`, withName));
    return [header, '', ...lines, footer ? '' : '', footer].filter((s, i, a) => !(s === '' && a[i - 1] === '')).join('\n').trim();
  };
  // 1) 상호 포함 전체 → 2) 지역만 → 3) 지역만 + 항목 축소
  let out = render(true, items.length);
  if (tweetWeight(out) <= limit) return out;
  out = render(false, items.length);
  if (tweetWeight(out) <= limit) return out;
  for (let n = items.length - 1; n >= 1; n--) {
    out = render(false, n);
    if (tweetWeight(out) <= limit) return out;
  }
  return out; // 1개로도 넘치면 그대로(거의 발생 안 함)
}

function buildTweetSingle(date: string, gasoline: { label: string; items: DailyTop10Item[]; avg: number | null }): string {
  if (gasoline.items.length === 0) {
    return `⛽ 오늘(${date}) 전국 ${gasoline.label} 최저가 정보는 잠시 후 업데이트됩니다.\n\n내 주변 최저가 👉 ${APP_URL}\n#기름값 #주유소 #최저가주유소`;
  }
  const top5 = gasoline.items.slice(0, 5);
  const avgLine = gasoline.avg != null ? `\n전국 평균 ${won(gasoline.avg)}원 · 최대 ${won(Math.max(0, gasoline.avg - top5[0].price))}원 ↓` : '';
  const header = `⛽ 오늘(${date}) 전국 ${gasoline.label} 최저가 TOP5`;
  const footer = `${avgLine}\nTOP10 + 내 주변 최저가 👉 ${APP_URL}\n#기름값 #주유소 #최저가주유소`;
  return fitTweet(header, top5, footer);
}

function buildTweetThread(
  date: string,
  gasoline: { label: string; items: DailyTop10Item[]; avg: number | null },
  diesel: { label: string; items: DailyTop10Item[]; avg: number | null },
): string[] {
  // [0] 인트로 + 휘발유 TOP5
  const t0 = gasoline.items.length
    ? fitTweet(
        `[1/3] ⛽ 오늘(${date}) 전국 ${gasoline.label} 최저가 TOP10 🧵\n오늘 1위는 리터당 ${won(gasoline.items[0].price)}원!`,
        gasoline.items.slice(0, 5),
        '',
      )
    : `[1/3] ⛽ 오늘(${date}) ${gasoline.label} 최저가 정보는 잠시 후 업데이트됩니다.`;

  // [1] 휘발유 6~10위
  const rest = gasoline.items.slice(5, 10);
  const t1 = rest.length
    ? fitTweet(`[2/3] ${gasoline.label} 6~10위 👇`, rest, '')
    : `[2/3] ${gasoline.label} 6~10위 데이터가 더 없습니다.`;

  // [2] 경유 TOP5 + 전국평균 코멘트 + CTA
  let avgComment = '';
  if (gasoline.avg != null && gasoline.items.length) {
    const diff = Math.max(0, gasoline.avg - gasoline.items[0].price);
    avgComment = `\n전국 평균 ${won(gasoline.avg)}원, 1위는 50L 가득 시 약 ${won(diff * 50)}원 ↓`;
  }
  const t2head = diesel.items.length
    ? `[3/3] 🚜 ${diesel.label} 최저가 TOP5`
    : `[3/3] 내 주변 최저가는 지도에서 1초 만에 👇`;
  const t2footer = `${avgComment}\n내 주변 최저가 👉 ${APP_URL}\n#기름값절약 #주유비 #최저가주유소`;
  const t2 = diesel.items.length
    ? fitTweet(t2head, diesel.items.slice(0, 5), t2footer)
    : `${t2head}${t2footer}`;

  return [t0, t1, t2];
}

// ─────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────

export async function buildDailyTop10Content(
  opts?: { products?: ProductCode[]; date?: string },
): Promise<DailyTop10Content> {
  const products = opts?.products && opts.products.length ? opts.products : DEFAULT_PRODUCTS;

  // 각 유종 TOP10 + 전국평균을 병렬 수집. 개별 실패는 빈 결과/ null 로 흡수.
  const results = await Promise.all(
    products.map(async (p) => {
      const [items, avg] = await Promise.all([
        queryDailyTop10(p).catch(() => [] as DailyTop10Item[]),
        fetchNationalAvg(p).catch(() => null),
      ]);
      return { product: p, label: PRODUCT_LABEL[p], items, avg };
    }),
  );

  const productsMap = {} as DailyTop10Content['products'];
  for (const r of results) {
    productsMap[r.product] = { label: r.label, items: r.items, avg: r.avg };
  }

  // 날짜 결정: DailyTop10Item에 거래일자 필드가 없으므로 opts.date > 어제(KST).
  const isoDate = opts?.date || yesterdayKstIso();
  const date = formatKoreanDate(isoDate);

  const sections = results.map((r) => ({ label: r.label, items: r.items, avg: r.avg }));
  const blogMarkdown = buildBlogMarkdown(date, sections);

  // 트위터는 휘발유(B027)/경유(D047) 중심. 없으면 첫 두 유종으로 대체.
  const gasoline =
    productsMap['B027'] ??
    { label: sections[0]?.label ?? '휘발유', items: sections[0]?.items ?? [], avg: sections[0]?.avg ?? null };
  const diesel =
    productsMap['D047'] ??
    { label: sections[1]?.label ?? '경유', items: sections[1]?.items ?? [], avg: sections[1]?.avg ?? null };

  const tweetSingle = buildTweetSingle(date, gasoline);
  const tweetThread = buildTweetThread(date, gasoline, diesel);

  return { date, products: productsMap, blogMarkdown, tweetSingle, tweetThread };
}
