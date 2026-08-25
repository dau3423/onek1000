'use client';

// 지역 랜딩(/regions/**) → 지도(/) 유도 CTA.
//
// 왜 필요한가(실측 2026-08-25): 28일 유입 3,602명 중 **네이버 모바일 검색이 509명(14%)** 이고,
// 그 사람들이 닿는 곳이 이 지역 페이지들이다. 그런데 지도로 가는 CTA 가 가격표(TOP10 × 2) 뒤,
// 페이지 맨 아래에만 있어 한참 스크롤해야 보였다.
//
// 설계 원칙: **막연히 "지도 보기"라고 하지 않는다.**
//   이 페이지는 이미 그 지역의 실제 최저가를 알고 있다. 그 숫자와 절약액을 먼저 보여 주고,
//   그다음에 "지도에만 있는 것"(내 위치 기준 정렬)을 약속한다. 구체적인 수가 기대를 만든다.

import Link from 'next/link';
import { track } from '@/lib/analytics';

/** 한 번 주유할 때 넣는 양의 어림값(L). 절약액을 체감 가능한 금액으로 환산하는 데만 쓴다. */
const TANK_LITERS = 50;

interface Props {
  /** 표시용 지역명 — '서울특별시 강남구' 또는 '강남구'. */
  place: string;
  /** 그 지역 최저가(원/L). 없으면 숫자 없이 문구만 나간다. */
  lowest?: number | null;
  /** 전국 평균가(원/L). lowest 와 함께 있을 때만 절약액을 계산한다. */
  nationalAvg?: number | null;
  /** 계측 구분 — 어느 페이지에서 눌렀는지. */
  from: 'sido' | 'district' | 'layer' | 'index';
  /** 가격이 없는 레이어(정비소·세차장·EV)용 제목/본문. 주면 가격 블록 대신 이걸 쓴다. */
  title?: string;
  body?: string;
  /** 목록 개수 — '이 지역에 N곳'처럼 구체성을 준다(선택). */
  count?: number | null;
  countNoun?: string;
  /** 버튼 문구 — 기본은 최저가용. 레이어 페이지는 다른 말이 자연스럽다. */
  ctaLabel?: string;
  /** 지도 링크에 붙일 쿼리(레이어 지정 등). 없으면 지도 첫 화면. */
  href?: string;
}

export function MapCta({ place, lowest, nationalAvg, from, href = '/', title, body, count, countNoun, ctaLabel }: Props) {
  // 전국 평균 대비 차이. 없는 이득을 지어내면 지도에 갔을 때 기대가 깨지므로,
  // **싼 지역과 비싼 지역의 말을 다르게** 한다.
  //   싼 지역  → 절약액을 앞세운다("50L 채우면 N원 아껴요").
  //   비싼 지역 → 절약을 말하지 않고, 지도에서 더 싼 곳을 찾을 수 있다는 쪽으로 돌린다.
  //              (실제로 서울 종로구는 1,948원 vs 전국 평균 1,811원으로 평균보다 비싸다.)
  const cheaper =
    typeof lowest === 'number' && typeof nationalAvg === 'number' && nationalAvg > lowest
      ? nationalAvg - lowest
      : null;
  const pricier =
    typeof lowest === 'number' && typeof nationalAvg === 'number' && lowest > nationalAvg
      ? lowest - nationalAvg
      : null;
  const save = cheaper != null ? Math.round(cheaper * TANK_LITERS) : null;

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-b from-orange-50 to-white">
      <div className="p-5">
        {title ? (
          <>
            <p className="text-base font-bold text-gray-900">{title}</p>
            {typeof count === 'number' && count > 0 && countNoun && (
              <p className="mt-1 text-[13px] font-semibold text-orange-800">
                {place}에 {count.toLocaleString()}곳의 {countNoun}가 있어요
              </p>
            )}
            {body && <p className="mt-2 text-[13px] leading-relaxed text-gray-700">{body}</p>}
          </>
        ) : typeof lowest === 'number' ? (
          <>
            <p className="text-[13px] font-semibold text-orange-800">지금 {place} 최저가</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-3xl font-extrabold tracking-tight text-gray-900">
                {lowest.toLocaleString()}
                <span className="ml-0.5 text-base font-bold text-gray-500">원/L</span>
              </span>
              {cheaper != null && (
                <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[12px] font-bold text-white">
                  전국 평균보다 {Math.round(cheaper).toLocaleString()}원 싸요
                </span>
              )}
              {pricier != null && (
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[12px] font-bold text-gray-700">
                  전국 평균보다 {Math.round(pricier).toLocaleString()}원 비싸요
                </span>
              )}
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-gray-700">
              {save != null ? (
                <>
                  <b>{TANK_LITERS}L 채우면 약 {save.toLocaleString()}원</b>을 아껴요.{' '}
                  이 표는 {place} 전체 기준이에요. 지도를 열면 <b>내 위치에서 가장 가까운 최저가</b>부터
                  보여드리고, 가는 길에 있는 더 싼 주유소도 찾아드려요.
                </>
              ) : pricier != null ? (
                <>
                  {place}는 기름값이 비싼 편이에요. 지도를 열면 <b>조금만 벗어나도 더 싼 주유소</b>를
                  함께 찾아드리고, 가는 길 위에 있는 곳까지 비교해 드려요.
                </>
              ) : (
                <>
                  이 표는 {place} 전체 기준이에요. 지도를 열면 <b>내 위치에서 가장 가까운 최저가</b>부터
                  보여드리고, 가는 길에 있는 더 싼 주유소도 찾아드려요.
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="text-base font-bold text-gray-900">내 주변 최저가는 지도에서</p>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-700">
              지도를 열면 <b>내 위치에서 가장 가까운 곳</b>부터 보여드려요.
              가는 길에 있는 더 싼 주유소도 함께 찾아드립니다.
            </p>
          </>
        )}

        <Link
          href={href}
          onClick={() => track('region_map_cta', { from })}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:bg-orange-600"
        >
          {ctaLabel ?? '지도에서 내 주변 최저가 보기'}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </Link>
        <p className="mt-2 text-center text-[11px] text-gray-400">
          설치 없이 바로 열려요 · 위치는 지도에서만 쓰고 저장하지 않아요
        </p>
      </div>
    </section>
  );
}
