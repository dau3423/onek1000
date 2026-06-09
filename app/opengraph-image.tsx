// 링크 공유(카톡/X/페이스북 등) 미리보기용 Open Graph 카드 이미지.
// Next.js App Router 컨벤션: 이 파일이 자동으로 og:image + twitter:image로 연결된다.
// next/og(ImageResponse=Satori)로 1200x630 브랜드 공유 카드를 생성한다.
//
// 한글 폰트 처리(daily-top10 OG와 동일 방식):
//  - Satori는 WOFF2/가변폰트를 지원하지 않으므로 런타임에 Noto Sans KR 정적 폰트(.woff/.ttf)를
//    best-effort로 받아 사용한다. fetch 실패 시 폰트 없이 렌더(이미지 생성 자체는 성공).

import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
// 외부 폰트 fetch(best-effort)를 위해 동적 처리. 결과는 헤더로 캐시.
export const dynamic = 'force-dynamic';

// 공유 카드 표준 규격(1.91:1)
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const alt = '1000냥 주유소 - 내 주변 최저가 주유소';

// Noto Sans KR 단일 굵기 정적 폰트 — Satori 호환(WOFF/TTF만, WOFF2·가변폰트 불가).
// .woff(소형)를 우선, 실패 시 .ttf로 폴백. 둘 다 실패하면 폰트 없이 렌더.
const FONT_400 = [
  'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-400-normal.woff',
  'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-400-normal.ttf',
];
const FONT_700 = [
  'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-700-normal.woff',
  'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-700-normal.ttf',
];

async function loadFont(urls: string[]): Promise<ArrayBuffer | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) return await res.arrayBuffer();
    } catch {
      // 다음 후보로
    }
  }
  return null;
}

export default async function Image() {
  const [regular, bold] = await Promise.all([loadFont(FONT_400), loadFont(FONT_700)]);

  const fonts = [
    regular && { name: 'NotoSansKR', data: regular, weight: 400 as const, style: 'normal' as const },
    bold && { name: 'NotoSansKR', data: bold, weight: 700 as const, style: 'normal' as const },
  ].filter(Boolean) as {
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: 'normal';
  }[];

  const fontFamily = fonts.length > 0 ? 'NotoSansKR' : 'sans-serif';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          // 브랜드 컬러(주황/primary) 그라데이션 배경
          backgroundImage: 'linear-gradient(135deg, #FF6B00 0%, #FF8A33 60%, #FFA552 100%)',
          color: '#ffffff',
          fontFamily,
          padding: 80,
        }}
      >
        {/* 로고 배지 — 조준점 아이콘을 그대로 쓰지 않고 카드형 워드마크로 구성 */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 84,
              height: 84,
              borderRadius: 24,
              backgroundColor: 'rgba(255,255,255,0.18)',
              fontSize: 48,
            }}
          >
            ⛽
          </div>
          <div
            style={{
              display: 'flex',
              marginLeft: 24,
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: -1,
            }}
          >
            1000냥 주유소
          </div>
        </div>

        {/* 메인 타이틀 */}
        <div
          style={{
            display: 'flex',
            marginTop: 56,
            fontSize: 88,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -2,
          }}
        >
          내 주변 최저가 주유소
        </div>

        {/* 태그라인 */}
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 40,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.92)',
          }}
        >
          전국 주유소 최저가를 한눈에
        </div>

        {/* 푸터 브랜딩 */}
        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            alignItems: 'center',
            fontSize: 32,
            fontWeight: 700,
            color: '#ffffff',
          }}
        >
          <div
            style={{
              display: 'flex',
              padding: '10px 24px',
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.18)',
            }}
          >
            onek1000.kr
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    },
  );
}
