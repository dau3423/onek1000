// 매일 SNS 게시용 — 전국 최저가 TOP10 이미지 카드(PNG) 생성.
// next/og(ImageResponse=Satori)로 1080x1350 세로 카드를 만든다. X 공유용.
// 데이터: 클라 전달이 아니라 서버에서 우리 DB로 동일 TOP10을 산출(페이지와 일관성).
//
// 한글 폰트 처리:
//  - Satori는 WOFF2를 지원하지 않으므로(프로젝트의 PretendardVariable.woff2는 사용 불가),
//    런타임에 Google Fonts CDN에서 Noto Sans KR TTF를 best-effort로 받아 폰트로 지정한다.
//  - 폰트 fetch 실패 시(네트워크 차단 등) 폰트 없이 렌더한다. 이 경우 한글이 기본 글리프로
//    대체될 수 있으나, 이미지 생성 자체가 실패하지는 않게 try/catch로 폴백한다.

import { ImageResponse } from 'next/og';
import { queryDailyTop10 } from '@/lib/db/queries';
import {
  todayKstLabel,
  formatPrice,
  sidoLabel,
  SITE_URL,
} from '@/lib/daily-top10';
import type { DailyTop10Item } from '@/types/station';

export const runtime = 'nodejs';
// DB 의존(요청 시 조회)이므로 빌드 프리렌더 대신 동적 처리.
export const dynamic = 'force-dynamic';

const WIDTH = 1080;
const HEIGHT = 1350;

// Noto Sans KR 단일 굵기 정적 폰트 — Satori 호환(WOFF/TTF만, WOFF2·가변폰트 불가).
// 가변폰트(NotoSansKR[wght].ttf)는 Satori fvar 파서가 깨지므로 사용하지 않는다.
// .woff(소형)를 우선, 실패 시 .ttf로 폴백. 둘 다 실패하면 폰트 없이 렌더.
const FONT_URLS = [
  'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-400-normal.woff',
  'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-400-normal.ttf',
];

async function loadKoreanFont(): Promise<ArrayBuffer | null> {
  for (const url of FONT_URLS) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) return await res.arrayBuffer();
    } catch {
      // 다음 후보로
    }
  }
  return null;
}

function Row({
  it,
  accent,
}: {
  it: DailyTop10Item;
  accent: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '5px 4px',
        borderBottom: '1px solid #eef0f2',
        fontSize: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: 44,
          color: accent,
          fontWeight: 700,
        }}
      >
        {`${it.rank}`}
      </div>
      <div style={{ display: 'flex', flex: 1, color: '#111827', fontWeight: 600 }}>
        {it.name}
      </div>
      <div style={{ display: 'flex', width: 150, color: '#6b7280', fontSize: 20 }}>
        {`${sidoLabel(it)}${it.isSelf ? ' · 셀프' : ''}`}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          width: 150,
          color: '#111827',
          fontWeight: 700,
        }}
      >
        {`${formatPrice(it.price)}원`}
      </div>
    </div>
  );
}

function Section({
  title,
  accent,
  items,
}: {
  title: string;
  accent: string;
  items: DailyTop10Item[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16 }}>
      <div
        style={{
          display: 'flex',
          fontSize: 28,
          fontWeight: 800,
          color: accent,
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((it) => (
          <Row key={`${it.id}-${it.rank}`} it={it} accent={accent} />
        ))}
      </div>
    </div>
  );
}

export async function GET() {
  const [gasoline, diesel, fontData] = await Promise.all([
    queryDailyTop10('B027'),
    queryDailyTop10('D047'),
    loadKoreanFont(),
  ]);
  const date = todayKstLabel();

  const fonts = fontData
    ? [{ name: 'NotoSansKR', data: fontData, weight: 400 as const, style: 'normal' as const }]
    : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          padding: 48,
          fontFamily: fonts ? 'NotoSansKR' : 'sans-serif',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 28, color: '#FF6B00', fontWeight: 700 }}>
            ⛽ 1000냥 주유소
          </div>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, color: '#111827', marginTop: 6 }}>
            전국 최저가 TOP10
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: '#6b7280', marginTop: 4 }}>
            {date}
          </div>
        </div>

        <Section title="🟢 휘발유 TOP10" accent="#16a34a" items={gasoline} />
        <Section title="⚫ 경유 TOP10" accent="#374151" items={diesel} />

        {/* 푸터 브랜딩 */}
        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            paddingTop: 16,
            fontSize: 24,
            color: '#9ca3af',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex' }}>실시간 지도 · 내 주변 최저가</div>
          <div style={{ display: 'flex', color: '#FF6B00', fontWeight: 700 }}>{SITE_URL}</div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  );
}
