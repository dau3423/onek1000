// SEO 시군구 랜딩 — "{시도} {시군구} 정비소 / 세차장 / 전기차 충전소".
// 주유소 랜딩(/regions/{시도}/{시군구})과 같은 자리에 레이어 세그먼트를 하나 더 두어,
// "수원 정비소"·"강남 세차장"·"분당 전기차 충전소" 같은 지역+업종 검색어를 잡는다.
//
// 세 종류를 한 파일로 처리한다 — 페이지 구조가 같고(목록 + 지도 유도 + 인접 지역 링크)
// 다른 건 라벨·문구·정렬뿐이라, 파일을 셋으로 나누면 같은 코드를 세 번 고치게 된다.
//
// 데이터가 0곳인 시군구는 아예 생성하지 않는다(generateStaticParams). 내용 없는 얇은 페이지는
// 색인에 도움이 되지 않고, 앞서 /regions 에서 겪은 "발견됨 - 색인 생성 안 됨"을 다시 부른다.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { regionBySlug, sigunguByCode, sigungusBySido, SIDO_SLUG } from '@/lib/regions';
import { SIGUNGU } from '@/lib/sigungu-data';
import {
  PLACE_LAYERS,
  isPlaceLayer,
  queryPlacesBySigungu,
  queryDistrictsWithPlaces,
  type PlaceLayer,
  type RegionPlaceItem,
} from '@/lib/db/placeRegions';
import { ChevronRightIcon } from '@/components/icons';

// 원천이 반기(정비소·세차장) 또는 일 단위(EV) 갱신이라 가격 페이지(1시간)만큼 자주 돌 필요가 없다.
export const revalidate = 86400;

const SITE = 'https://onek1000.kr';

/** 레이어별 화면 문구. 이 페이지는 한국어 전용(/regions 트리 전체가 그렇다)이라 카탈로그를 쓰지 않는다. */
const LAYER_COPY: Record<PlaceLayer, {
  noun: string;
  h1: (place: string) => string;
  intro: (place: string) => string;
  ctaTitle: (district: string) => string;
  ctaBody: string;
  source: string;
  detailPath: (key: string) => string;
}> = {
  repair: {
    noun: '정비소',
    h1: (p) => `${p} 자동차 정비소 찾기`,
    intro: (p) =>
      `${p}에 있는 자동차 정비소를 정리했습니다. 기아 오토큐·현대 블루핸즈 같은 공식 서비스망부터 ` +
      `타이어 전문점, 동네 카센터까지 지도에서 브랜드별로 골라 볼 수 있습니다.`,
    ctaTitle: (d) => `${d} 정비소, 지도에서 브랜드별로`,
    ctaBody: '오토큐·블루핸즈·타이어 전문점만 골라 보고, 전화번호가 있으면 바로 전화도 걸 수 있어요.',
    source: '정비소 정보 제공: 공공데이터포털 전국자동차정비업체표준데이터',
    detailPath: (k) => `/repair/${encodeURIComponent(k)}`,
  },
  carwash: {
    noun: '세차장',
    h1: (p) => `${p} 세차장 찾기`,
    intro: (p) =>
      `${p}에 있는 세차장을 정리했습니다. 셀프세차·손세차·자동세차를 유형별로 구분해 ` +
      `지도에서 바로 확인할 수 있고, 오늘 세차하기 좋은 날인지도 함께 볼 수 있습니다.`,
    ctaTitle: (d) => `${d} 세차장, 오늘 세차해도 될까?`,
    ctaBody: '강수 확률·미세먼지로 계산한 세차 지수를 함께 보여드려요. 유형(셀프·손세차·자동)으로 걸러 볼 수도 있습니다.',
    source: '세차장 정보 제공: 행정안전부 전국세차장표준데이터',
    detailPath: (k) => `/carwash/${encodeURIComponent(k)}`,
  },
  ev: {
    noun: '전기차 충전소',
    h1: (p) => `${p} 전기차 충전소 찾기`,
    intro: (p) =>
      `${p}에 있는 전기차 충전소를 정리했습니다. 지도에서는 지금 사용할 수 있는 충전기가 있는지, ` +
      `급속 충전이 되는지까지 실시간으로 확인할 수 있습니다.`,
    ctaTitle: (d) => `${d} 충전소, 지금 비어 있는 곳만`,
    ctaBody: '충전기 상태를 실시간으로 받아와 사용 가능한 곳을 초록으로 표시해요. 급속 보유 여부도 함께 보입니다.',
    source: '충전소 정보 제공: 한국환경공단 전기차 충전소 정보(공공데이터포털)',
    detailPath: (k) => `/ev/${encodeURIComponent(k)}`,
  },
};

export async function generateStaticParams() {
  // 레이어마다 "데이터가 있는 시군구"를 구해 교집합만 만든다.
  const withData = await Promise.all(
    PLACE_LAYERS.map(async (layer) => ({ layer, codes: await queryDistrictsWithPlaces(layer) })),
  );
  const params: { region: string; district: string; layer: string }[] = [];
  for (const { layer, codes } of withData) {
    for (const sg of SIGUNGU) {
      if (!codes.has(sg.code)) continue;
      params.push({ region: SIDO_SLUG[sg.sido], district: sg.code, layer });
    }
  }
  return params;
}

interface Params { region: string; district: string; layer: string }

function resolve(params: Params) {
  const region = regionBySlug(params.region);
  const sg = sigunguByCode(params.district);
  const layer = isPlaceLayer(params.layer) ? params.layer : null;
  // 시군구가 URL 의 시도에 실제로 속할 때만 유효(/regions/busan/0113/repair 같은 불일치 차단).
  if (!region || !sg || !layer || sg.sido !== region.code) return null;
  return { region, sg, layer };
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const r = resolve(params);
  if (!r) return {};
  const copy = LAYER_COPY[r.layer];
  const place = `${r.region.name} ${r.sg.name}`;
  const title = `${place} ${copy.noun} 찾기 | 1000냥 주유소`;
  const description = copy.intro(place);
  const url = `/regions/${r.region.slug}/${r.sg.code}/${r.layer}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function RegionLayerPage({ params }: { params: Params }) {
  const r = resolve(params);
  if (!r) notFound();
  const { region, sg, layer } = r;
  const copy = LAYER_COPY[layer];
  const place = `${region.name} ${sg.name}`;

  const items = await queryPlacesBySigungu(layer, sg.code);
  const siblings = sigungusBySido(region.code).filter((d) => d.code !== sg.code);
  // 같은 시군구의 다른 업종 — 크롤러가 세 트리를 오갈 경로가 된다.
  const otherLayers = PLACE_LAYERS.filter((l) => l !== layer);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '지역별 최저가', item: `${SITE}/regions` },
          { '@type': 'ListItem', position: 2, name: region.name, item: `${SITE}/regions/${region.slug}` },
          { '@type': 'ListItem', position: 3, name: sg.name, item: `${SITE}/regions/${region.slug}/${sg.code}` },
          { '@type': 'ListItem', position: 4, name: copy.noun, item: `${SITE}/regions/${region.slug}/${sg.code}/${layer}` },
        ],
      },
      {
        '@type': 'ItemList',
        name: `${place} ${copy.noun}`,
        itemListElement: items.slice(0, 20).map((it, i) => ({
          '@type': 'ListItem', position: i + 1, name: it.name,
        })),
      },
    ],
  };

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-[12px] text-gray-400">
        <Link href="/regions" className="hover:text-gray-600">지역별 최저가</Link>
        <ChevronRightIcon className="mx-1 inline h-3 w-3 align-middle text-gray-400" />
        <Link href={`/regions/${region.slug}`} className="hover:text-gray-600">{region.name}</Link>
        <ChevronRightIcon className="mx-1 inline h-3 w-3 align-middle text-gray-400" />
        <Link href={`/regions/${region.slug}/${sg.code}`} className="hover:text-gray-600">{sg.name}</Link>
        <ChevronRightIcon className="mx-1 inline h-3 w-3 align-middle text-gray-400" />
        <span className="text-gray-600">{copy.noun}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-bold text-gray-900">{copy.h1(place)}</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{copy.intro(place)}</p>

      {items.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-gray-700">
            {place} {copy.noun} {items.length}곳
            {items.length >= 60 ? ' (일부)' : ''}
          </h2>
          <ul className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-100">
            {items.map((it) => (
              <PlaceRow key={it.key} item={it} href={copy.detailPath(it.key)} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
          아직 {place}에서 확인된 {copy.noun} 정보가 없어요. 지도에서 주변 지역을 살펴보세요.
        </p>
      )}

      <section className="mt-10 rounded-2xl border border-orange-200 bg-orange-50 p-5">
        <h2 className="text-base font-bold text-orange-900">{copy.ctaTitle(sg.name)}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-orange-800">{copy.ctaBody}</p>
        <div className="mt-3 flex gap-2">
          <Link href="/" className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600">
            지도에서 보기
          </Link>
          <Link href={`/regions/${region.slug}/${sg.code}`} className="rounded-xl border border-orange-300 bg-white px-4 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100">
            {sg.name} 최저가 주유소
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-bold text-gray-700">{sg.name} 다른 정보</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {otherLayers.map((l) => (
            <Link
              key={l}
              href={`/regions/${region.slug}/${sg.code}/${l}`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50"
            >
              {sg.name} {LAYER_COPY[l].noun}
            </Link>
          ))}
        </div>
      </section>

      {siblings.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold text-gray-700">{region.name} 다른 지역 {copy.noun}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {siblings.map((d) => (
              <Link
                key={d.code}
                href={`/regions/${region.slug}/${d.code}/${layer}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50"
              >
                {d.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10 border-t border-gray-100 pt-4 text-center text-[10px] leading-relaxed text-gray-400">
        {copy.source}
        <br />
        공공데이터 기준이라 폐업·정보가 실제와 다를 수 있어요.
      </footer>
    </main>
  );
}

/** 목록 1행 — 상세 페이지로 보낸다(그 페이지가 이 트리의 말단 크롤 대상이 된다). */
function PlaceRow({ item, href }: { item: RegionPlaceItem; href: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900">{item.name}</div>
          {item.address && (
            <div className="truncate text-xs text-gray-500">{item.address}</div>
          )}
        </div>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300" />
      </Link>
    </li>
  );
}
