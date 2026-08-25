import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { RegionMapLink } from '@/components/regions/RegionMapLink';

/**
 * 지역 랜딩(/regions/**) 공통 뼈대.
 *
 * 왜 만들었나: 이 페이지들에는 **레이아웃이 아예 없었다**. 로고도 헤더도 푸터도 없이
 * 본문만 있어서, 검색으로 들어온 사람은 어느 서비스인지 모른 채 가격표만 보고 나갔다.
 * 실측(28일)에서 네이버 모바일 검색 유입이 509명(전체의 14%)인데 그 사람들이 닿는 곳이
 * 정확히 여기다 — 브랜드도 지도 동선도 없는 상태였다.
 *
 * (intl) 라우트 그룹 밖이라 next-intl 을 쓰지 않는다. 이 트리는 한국어 전용이며,
 * 그래서 앱 헤더(components/ui/Header)를 재사용하지 않고 가벼운 전용 헤더를 둔다.
 */
export default function RegionsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-gray-50">
      {/* 스크롤해도 따라오는 헤더 — 지도로 가는 길을 항상 화면에 남긴다.
          예전에는 지도 CTA 가 본문 맨 아래에만 있어, 표를 읽다 이탈하면 접점이 사라졌다. */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-5">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Image
              src="/icons/app_icon.png"
              alt="1000냥 주유소"
              width={32}
              height={32}
              className="shrink-0 rounded-lg"
              priority
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-tight text-gray-900">1000냥 주유소</span>
              <span className="block truncate text-[11px] leading-tight text-gray-500">전국 주유소 실시간 최저가</span>
            </span>
          </Link>
          <RegionMapLink />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 pb-16 pt-6">{children}</div>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-2xl px-5 py-8">
          <div className="flex items-center gap-2">
            <Image src="/icons/app_icon.png" alt="" width={28} height={28} className="rounded-lg" />
            <span className="text-sm font-bold text-gray-900">1000냥 주유소</span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-gray-500">
            한국석유공사 오피넷 가격을 매일 받아 전국 주유소 최저가를 지도에서 보여드립니다.
            내 위치·이동 경로 기준으로 가장 싼 곳을 찾아드리고, 세차장·정비소·충전소·렌터카도 함께 표시합니다.
          </p>
          <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-gray-500">
            <Link href="/" className="hover:text-gray-800 hover:underline">지도</Link>
            <Link href="/regions" className="hover:text-gray-800 hover:underline">지역별 최저가</Link>
            <Link href="/legal/terms" className="hover:text-gray-800 hover:underline">이용약관</Link>
            <Link href="/legal/privacy" className="hover:text-gray-800 hover:underline">개인정보처리방침</Link>
            <Link href="/legal/business" className="hover:text-gray-800 hover:underline">사업자 정보</Link>
          </nav>
          <p className="mt-4 text-[11px] leading-relaxed text-gray-400">
            가격 정보 제공: 한국석유공사 오피넷 · 표시 가격은 실시간으로 변동될 수 있습니다.
          </p>
        </div>
      </footer>
    </div>
  );
}
