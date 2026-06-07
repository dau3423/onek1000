// 매일 SNS 게시(전국 최저가 TOP10) 복붙/이미지 공통 포맷 유틸.
// 페이지(app/admin/daily-top10)·이미지 라우트(app/api/og/daily-top10)에서 공유한다.
// 외부 의존 없이 순수 함수만 둔다(서버/클라 양쪽에서 import 가능).

import { BRAND_LABEL, SIDO_NAME, PRODUCT_LABEL } from '@/types/station';
import type { DailyTop10Item, ProductCode } from '@/types/station';

/** 서비스 노출용 도메인(브랜딩/링크). */
export const SITE_URL = 'onek1000.kr';

/** 천단위 콤마. 원/L 가격 표시 일관. */
export function formatPrice(price: number): string {
  return Math.round(price).toLocaleString('ko-KR');
}

/** KST(Asia/Seoul) 기준 오늘 날짜 'YYYY.MM.DD (요일)'. 서버 타임존 무관하게 동작. */
export function todayKstLabel(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const w = get('weekday');
  return `${y}.${m}.${d} (${w})`;
}

/** 브랜드 라벨(없으면 자영/기타). */
export function brandLabel(item: DailyTop10Item): string {
  return BRAND_LABEL[item.brand] ?? '자영/기타';
}

/** 지역(시도) 라벨. */
export function sidoLabel(item: DailyTop10Item): string {
  return SIDO_NAME[item.sido] ?? '-';
}

/** 한 항목의 한 줄 요약(텍스트 공유용). 예: "1. 알뜰 신논현셀프 1,567원 (서울·셀프)" */
function lineOf(item: DailyTop10Item): string {
  const self = item.isSelf ? '·셀프' : '';
  return `${item.rank}. ${item.name} ${formatPrice(item.price)}원 (${sidoLabel(item)}${self})`;
}

/**
 * X(트위터)용 텍스트 생성. 280자 제한을 고려해 유종별 상위 N개(기본 3)만 담는다.
 * 길이가 초과하면 N을 줄여 280자 이내로 맞춘다(해시태그/링크는 항상 유지).
 */
export function buildXText(
  date: string,
  gasoline: DailyTop10Item[],
  diesel: DailyTop10Item[],
  topN = 3,
): string {
  const hashtags = '#기름값 #최저가주유소 #1000냥주유소';
  const link = `▶ 전체 순위 ${SITE_URL}`;

  const compose = (n: number): string => {
    const gLines = gasoline.slice(0, n).map(lineOf).join('\n');
    const dLines = diesel.slice(0, n).map(lineOf).join('\n');
    return [
      `⛽ ${date} 전국 최저가 TOP${gasoline.length || 10}`,
      '',
      `🟢 휘발유\n${gLines}`,
      '',
      `⚫ 경유\n${dLines}`,
      '',
      link,
      hashtags,
    ].join('\n');
  };

  // 280자(X 기준) 이내가 되도록 N을 줄여가며 맞춘다. URL은 t.co로 23자 환산되지만
  // 보수적으로 실제 길이 기준 280자에 맞춰 잘라낸다(잘려도 의미 보존).
  for (let n = topN; n >= 1; n--) {
    const text = compose(n);
    if ([...text].length <= 280) return text;
  }
  return compose(1);
}

const TH = 'padding:8px 10px;font-size:14px;color:#374151;border-bottom:2px solid #e5e7eb;text-align:left;';
const TD = 'padding:7px 10px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;';

function htmlTable(title: string, items: DailyTop10Item[], accent: string): string {
  const rows = items
    .map(
      (it) =>
        `<tr>` +
        `<td style="${TD}text-align:center;font-weight:700;color:${accent};">${it.rank}</td>` +
        `<td style="${TD}font-weight:600;">${escapeHtml(it.name)}</td>` +
        `<td style="${TD}">${escapeHtml(brandLabel(it))}</td>` +
        `<td style="${TD}">${escapeHtml(sidoLabel(it))}${it.isSelf ? ' · 셀프' : ''}</td>` +
        `<td style="${TD}text-align:right;font-weight:700;">${formatPrice(it.price)}원</td>` +
        `</tr>`,
    )
    .join('');
  return (
    `<h3 style="margin:18px 0 8px;font-size:18px;color:${accent};">${escapeHtml(title)}</h3>` +
    `<table style="width:100%;border-collapse:collapse;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">` +
    `<thead><tr>` +
    `<th style="${TH}text-align:center;width:44px;">순위</th>` +
    `<th style="${TH}">주유소</th>` +
    `<th style="${TH}width:90px;">브랜드</th>` +
    `<th style="${TH}width:110px;">지역</th>` +
    `<th style="${TH}text-align:right;width:90px;">가격</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>`
  );
}

/** 티스토리 에디터 붙여넣기용 inline-style HTML(휘발유/경유 표 전체). */
export function buildTistoryHtml(
  date: string,
  gasoline: DailyTop10Item[],
  diesel: DailyTop10Item[],
): string {
  return (
    `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111827;">` +
    `<h2 style="font-size:22px;margin:0 0 4px;">⛽ ${escapeHtml(date)} 전국 최저가 주유소 TOP10</h2>` +
    `<p style="font-size:13px;color:#6b7280;margin:0 0 8px;">출처: 한국석유공사 오피넷 · 1000냥 주유소(${SITE_URL})</p>` +
    htmlTable(`🟢 ${PRODUCT_LABEL.B027} TOP10`, gasoline, '#16a34a') +
    htmlTable(`⚫ ${PRODUCT_LABEL.D047} TOP10`, diesel, '#374151') +
    `<p style="font-size:13px;color:#6b7280;margin-top:14px;">실시간 지도·내 주변 최저가는 <a href="https://${SITE_URL}">${SITE_URL}</a> 에서 확인하세요.</p>` +
    `</div>`
  );
}

/** 표/HTML 삽입 시 사용자 입력 텍스트(주유소명 등) 이스케이프. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** product 라벨(헤더 등 표시용). */
export function productLabel(product: ProductCode): string {
  return PRODUCT_LABEL[product];
}
