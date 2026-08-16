'use client';

// 홈 "세차하기 좋은 날" 미니 카드 (FR-3).
//  - /api/carwash-index 를 조회해 이번 주(오늘~D+3) 세차 지수를 보여준다.
//  - 데이터 없음/오늘 하루 숨김이면 스스로 미렌더(graceful). 지도 아래 문서 흐름에 배치.
//  - CTA 탭 시 계측(carwash_card_click) 후 부모 콜백(onCta)로 세차 칩 활성/스크롤/시트 열기를 위임.
//
// 데이터 페칭: 코드베이스에 react-query 미도입 → ForecastCard 와 동일하게
//   useEffect + fetch + AbortController 패턴을 따른다(불필요 의존성 추가 회피).

import { useEffect, useState } from 'react';
import { track } from '@/lib/analytics';
import { DropletIcon, ChevronRightIcon } from '@/components/icons';
import type { CarwashGrade } from '@/lib/weather/kma';

// 조회 API 응답 계약(lib/weather/kma 의 CarwashIndexResult 와 동일 필드).
interface CarwashDay {
  date: string;
  score: number;
  grade: CarwashGrade;
  popMax: number | null;
  popNext: number | null;
  dustGrade: string | null;
}
interface CarwashIndexResponse {
  region: string;
  regionName: string;
  days: CarwashDay[];
  best: CarwashDay | null;
}

interface Props {
  /** CTA(세차 되는 최저가 주유소 보기) 탭 시 부모가 세차 칩 활성/스크롤/시트 열기를 수행. */
  onCta: () => void;
  /** 조회 기준 좌표(내 위치 우선 → 지도 중심). null이면 서울 폴백(카드에 "서울 기준" 라벨). */
  lat?: number | null;
  lng?: number | null;
}

const HIDE_KEY = 'carwashCardHideUntil';
const WD = ['일', '월', '화', '수', '목', '금', '토'];

/** KST(UTC+9) 기준 오늘 'YYYY-MM-DD'. */
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → 요일 한 글자(KST 달력일 기준). */
function weekdayChar(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return WD[d.getUTCDay()] ?? '';
}
function fullWeekday(date: string): string {
  return `${weekdayChar(date)}요일`;
}
/** 'YYYY-MM-DD' 다음 날 문자열. */
function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`).getTime() + 86400000;
  return new Date(d).toISOString().slice(0, 10);
}
/** 스트립 셀 요일 라벨 — 오늘/내일은 상대 표기, 그 외는 요일 한 글자. */
function relLabel(date: string, today: string): string {
  if (date === today) return '오늘';
  if (date === nextDate(today)) return '내일';
  return weekdayChar(date);
}

const GRADE_LABEL: Record<CarwashGrade, string> = { good: '좋음', fair: '보통', bad: '나쁨' };
// 등급 필/배지 색 — 카드 문맥 한정 + 라벨 병기(색 단독 전달 금지, 접근성).
const GRADE_CLASS: Record<CarwashGrade, string> = {
  good: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  fair: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  bad: 'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900',
};

const SEOUL = { lat: 37.5665, lng: 126.9780 };

export function CarwashDayCard({ onCta, lat, lng }: Props) {
  const [data, setData] = useState<CarwashIndexResponse | null>(null);
  const [hidden, setHidden] = useState(false);

  // "오늘 하루 숨김" 판정(마운트 시 1회). localStorage 불가(프라이빗 모드)면 세션 한정.
  useEffect(() => {
    try {
      if (localStorage.getItem(HIDE_KEY) === kstToday()) setHidden(true);
    } catch {
      /* noop */
    }
  }, []);

  // 세차 지수 조회 — 좌표 있으면 사용, 없으면 서울 폴백(위치를 저장하지 않는 일회성 조회).
  useEffect(() => {
    if (hidden) return;
    const q = new URLSearchParams({
      lat: String(lat ?? SEOUL.lat),
      lng: String(lng ?? SEOUL.lng),
    });
    const ac = new AbortController();
    fetch(`/api/carwash-index?${q}`, { signal: ac.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as CarwashIndexResponse) : null))
      .then((d) => setData(d))
      .catch((e) => {
        if (e?.name !== 'AbortError') setData(null);
      });
    return () => ac.abort();
  }, [hidden, lat, lng]);

  // graceful 미렌더: 숨김 / 데이터 없음 / 지수 없음(배치 미실행·실패).
  if (hidden || !data || data.days.length === 0 || !data.best) return null;

  const { days, best, regionName } = data;
  const allBad = days.every((d) => d.grade === 'bad');
  const today = kstToday();

  const title = allBad
    ? '이번 주는 세차를 미루는 게 좋겠어요'
    : `이번 주 세차하기 좋은 날: ${fullWeekday(best.date)}`;

  // 근거 한 줄(카피 원칙: 단정 금지 — 확률/등급 표현만).
  const reason = (() => {
    if (allBad) {
      const pops = days.map((d) => d.popMax).filter((p): p is number => p != null);
      const minPop = pops.length ? Math.min(...pops) : null;
      return minPop != null ? `나흘 내내 강수확률 ${minPop}% 이상` : '나흘 내내 강수 예보가 이어져요';
    }
    const parts: string[] = [];
    parts.push(best.popMax != null ? `${fullWeekday(best.date)} 강수확률 ${best.popMax}%` : `${fullWeekday(best.date)}이 가장 좋아요`);
    if (best.popNext != null && best.popNext >= 40) {
      parts.push(`${fullWeekday(nextDate(best.date))} ${best.popNext}%`);
    } else if (best.dustGrade?.includes('나쁨')) {
      parts.push(`미세먼지 ${best.dustGrade}`);
    }
    return parts.join(' · ');
  })();

  const usedDust = days.some((d) => d.dustGrade != null);
  const disclaimer = `예보 기반 참고용 지수입니다 · 출처: 기상청${usedDust ? ' · 에어코리아' : ''}`;

  const handleCta = () => {
    track('carwash_card_click', { bestDay: best.date, grade: best.grade });
    onCta();
  };

  const hideToday = () => {
    try {
      localStorage.setItem(HIDE_KEY, kstToday());
    } catch {
      /* noop */
    }
    setHidden(true);
  };

  return (
    <section
      aria-label="세차하기 좋은 날"
      className="mx-3 mb-3 mt-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      {/* 헤더행: 좌 라벨(지역 기준) / 우 오늘 하루 숨김 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
          <DropletIcon className="h-4 w-4" />세차하기 좋은 날 · {regionName} 기준
        </div>
        <button
          type="button"
          onClick={hideToday}
          className="-m-2 p-2 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          오늘 하루 숨김
        </button>
      </div>

      {/* 제목 + 등급 배지 */}
      <div className="mt-1.5 flex items-center gap-2">
        <h2 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">{title}</h2>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_CLASS[best.grade]}`}>
          {GRADE_LABEL[best.grade]}
        </span>
      </div>

      {/* 근거 한 줄 */}
      <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-300">{reason}</p>

      {/* 4일 요일 스트립 */}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {days.slice(0, 4).map((d) => {
          const isBest = d.date === best.date;
          const wdLabel = relLabel(d.date, today);
          return (
            <div
              key={d.date}
              aria-label={`${wdLabel} ${GRADE_LABEL[d.grade]}${d.popMax != null ? `, 강수확률 ${d.popMax}%` : ''}${d.dustGrade ? `, 미세먼지 ${d.dustGrade}` : ''}`}
              className={`rounded-xl bg-gray-50 py-2 text-center dark:bg-gray-800 ${isBest ? 'ring-1 ring-primary/40' : ''}`}
            >
              <div className={`text-[11px] font-semibold ${isBest ? 'text-primary' : 'text-gray-600 dark:text-gray-300'}`}>
                {wdLabel}
              </div>
              <div className={`mx-auto mt-1 w-fit rounded-full px-1.5 py-0.5 text-[10px] font-bold ${GRADE_CLASS[d.grade]}`}>
                {GRADE_LABEL[d.grade]}
              </div>
              <div className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                {d.popMax != null ? `강수 ${d.popMax}%` : '강수 —'}
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA — 세차 되는 최저가 주유소 보기. 전부 나쁨이면 보조 스타일(위계 강등). */}
      <button
        type="button"
        onClick={handleCta}
        className={`mt-3 flex w-full items-center justify-center gap-1 rounded-xl py-3 text-sm font-bold ${
          allBad
            ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
            : 'bg-primary text-white hover:bg-primary/90'
        }`}
      >
        세차 되는 최저가 주유소 보기
        <ChevronRightIcon className="h-4 w-4" />
      </button>

      {/* 면책·출처 */}
      <p className="mt-2 text-center text-[10px] text-gray-400 dark:text-gray-500">{disclaimer}</p>
    </section>
  );
}

export default CarwashDayCard;
