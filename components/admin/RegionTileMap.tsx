// 관리자 지역별 접속 (최근 7일) 섹션 — 서버 컴포넌트(카카오 SDK·클라이언트 JS·상태 없음).
//
// 직접 저작한 스키매틱 SVG 타일 단계구분도 + 수치 표. 외부 시도 경계 GeoJSON을 쓰지 않고
// design.md의 "타일 좌표 배치표"대로 17개 시도를 상대 위치에 근사 배치한다(라이선스 리스크 회피).
// 개인 핀·좌표성 표시는 일절 없다 — 시도 단위 집계 색 농도와 수치만 그린다.
//
// 라이트 고정 컨텍스트(/admin) 전용 — dark: 클래스를 쓰지 않는다(color-scheme:light 신뢰).

import type { SidoCode } from '@/types/station';
import { SIDO_NAME } from '@/types/station';
import type { RegionVisitRow } from '@/lib/db/stats';

// ─── 타일 배치·치수 상수(design.md "좌표 계산·치수") ───
const TILE = 64;
const GAP = 8;
const PAD = 8;
const JEJU_OFFSET = 16; // row 5(제주·미상) 전용 추가 y — 본토와 시각적 분리.
const VIEW_W = 368; // 8 + 5*64 + 4*8 + 8
const VIEW_H = 456; // 384 + 64 + 8

// 5열 × 6행 그리드 상 시도 위치(design.md 배치표). Record<SidoCode, …>로 17개를 타입 강제.
const TILE_GRID: Record<SidoCode, { row: number; col: number }> = {
  '01': { row: 0, col: 1 }, // 서울
  '03': { row: 0, col: 3 }, // 강원
  '15': { row: 1, col: 0 }, // 인천
  '02': { row: 1, col: 1 }, // 경기
  '04': { row: 1, col: 2 }, // 충북
  '05': { row: 2, col: 1 }, // 충남
  '19': { row: 2, col: 2 }, // 세종
  '08': { row: 2, col: 3 }, // 경북
  '06': { row: 3, col: 1 }, // 전북
  '17': { row: 3, col: 2 }, // 대전
  '14': { row: 3, col: 3 }, // 대구
  '18': { row: 3, col: 4 }, // 울산
  '16': { row: 4, col: 0 }, // 광주
  '07': { row: 4, col: 1 }, // 전남
  '09': { row: 4, col: 2 }, // 경남
  '10': { row: 4, col: 4 }, // 부산
  '11': { row: 5, col: 0 }, // 제주(y+16)
};

// 미상 블록 위치(지리 타일 밖 — row5·col4, 제주와 같은 y 오프셋).
const MISANG_POS = { row: 5, col: 4 };

const tileX = (col: number): number => PAD + col * (TILE + GAP);
const tileY = (row: number): number => PAD + row * (TILE + GAP) + (row === 5 ? JEJU_OFFSET : 0);

// ─── 색 농도 스케일(5단계 = 0단계 + 분위 4단계, design.md 색 스케일 표) ───
const FILL = ['#F3F4F6', '#DBEAFE', '#93C5FD', '#2563EB', '#1E3A8A'] as const;
const LABEL = ['#6B7280', '#1E3A8A', '#1E3A8A', '#FFFFFF', '#FFFFFF'] as const;

interface Thresholds {
  q1: number;
  q2: number;
  q3: number;
}

// 방문수 > 0 인 시도 값만으로 분위 임계값 산출(단순식 v[floor((n-1)*p)]로 충분 — design.md).
function computeThresholds(sidoVisits: number[]): Thresholds {
  const pos = sidoVisits.filter((v) => v > 0).sort((a, b) => a - b);
  const n = pos.length;
  if (n === 0) return { q1: 0, q2: 0, q3: 0 };
  const at = (p: number): number => pos[Math.min(n - 1, Math.floor((n - 1) * p))];
  return { q1: at(0.25), q2: at(0.5), q3: at(0.75) };
}

// 방문수 → 단계(0~4). 0(무데이터 포함)은 항상 0단계.
function stepOf(v: number, t: Thresholds): number {
  if (v <= 0) return 0;
  if (v <= t.q1) return 1;
  if (v <= t.q2) return 2;
  if (v <= t.q3) return 3;
  return 4;
}

const nf = (n: number): string => n.toLocaleString('ko-KR');

// ─── 확정 문구(plan/design) ───
const HINT = 'IP 기반 추정(GeoLite2) · 모바일 통신사 IP는 수도권으로 집계될 수 있음 · 절대값보다 추이 참고';
const ATTRIBUTION =
  'This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com';

// SVG 타일 1개(시도).
function Tile({ code, visits, step }: { code: SidoCode; visits: number; step: number }) {
  const { row, col } = TILE_GRID[code];
  const x = tileX(col);
  const y = tileY(row);
  const fill = FILL[step];
  const color = LABEL[step];
  const name = SIDO_NAME[code];
  return (
    <g>
      <title>{`${name} ${nf(visits)}명`}</title>
      <rect
        x={x}
        y={y}
        rx={10}
        width={TILE}
        height={TILE}
        fill={fill}
        {...(step === 0 ? { stroke: '#E5E7EB', strokeWidth: 1 } : {})}
      />
      <text x={x + 32} y={y + 28} textAnchor="middle" fontSize={13} fontWeight={700} fill={color}>
        {name}
      </text>
      <text x={x + 32} y={y + 46} textAnchor="middle" fontSize={11} fontWeight={500} fill={color}>
        {nf(visits)}
      </text>
    </g>
  );
}

// 미상 블록(지리 타일 아님 — 대시 보더 + 무채색, 색 농도 스케일 미적용).
function MisangBlock({ visits }: { visits: number }) {
  const x = tileX(MISANG_POS.col);
  const y = tileY(MISANG_POS.row);
  return (
    <g>
      <title>{`미상(지역 추정 실패) ${nf(visits)}명`}</title>
      <rect
        x={x}
        y={y}
        rx={10}
        width={TILE}
        height={TILE}
        fill="#F9FAFB"
        stroke="#9CA3AF"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <text x={x + 32} y={y + 28} textAnchor="middle" fontSize={13} fontWeight={700} fill="#6B7280">
        미상
      </text>
      <text x={x + 32} y={y + 46} textAnchor="middle" fontSize={11} fontWeight={500} fill="#6B7280">
        {nf(visits)}
      </text>
    </g>
  );
}

function TileMapSvg({
  visitBySido,
  misang,
  thresholds,
}: {
  visitBySido: Record<SidoCode, number>;
  misang: number;
  thresholds: Thresholds;
}) {
  const codes = Object.keys(TILE_GRID) as SidoCode[];
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-auto w-full"
      role="img"
      aria-label="시도별 최근 7일 방문 단계구분도"
    >
      {codes.map((code) => {
        const v = visitBySido[code] ?? 0;
        return <Tile key={code} code={code} visits={v} step={stepOf(v, thresholds)} />;
      })}
      <MisangBlock visits={misang} />
    </svg>
  );
}

// 범례(0단계 + 분위 4단계, 실제 임계값 구간 표기).
function Legend({ t }: { t: Thresholds }) {
  const items: { fill: string; label: string; bordered?: boolean }[] = [
    { fill: FILL[0], label: '0', bordered: true },
    { fill: FILL[1], label: `1–${nf(t.q1)}` },
    { fill: FILL[2], label: `${nf(t.q1 + 1)}–${nf(t.q2)}` },
    { fill: FILL[3], label: `${nf(t.q2 + 1)}–${nf(t.q3)}` },
    { fill: FILL[4], label: `${nf(t.q3 + 1)}+` },
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1">
          <span
            className={`inline-block h-3 w-3 rounded-[3px] ${it.bordered ? 'border border-gray-200' : ''}`}
            style={{ backgroundColor: it.fill }}
            aria-hidden
          />
          <span className="text-[10px] text-gray-500">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

// 수치 표(순위·시도·방문수·비율) — 방문수 내림차순, 미상 행은 하단 고정.
function RegionTable({
  ranked,
  misang,
  total,
}: {
  ranked: { code: SidoCode; visits: number }[];
  misang: number;
  total: number;
}) {
  const pct = (v: number): string => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '-');
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">시도별 최근 7일 방문수와 비율</caption>
      <thead>
        <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
          <th className="w-10 py-2 text-center font-medium">순위</th>
          <th className="py-2 font-medium">시도</th>
          <th className="py-2 text-right font-medium">방문수</th>
          <th className="w-14 py-2 text-right font-medium">비율</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((r, i) => (
          <tr key={r.code} className="border-b border-gray-100 last:border-0">
            <td className="py-1.5 text-center text-gray-500 tabular-nums">{i + 1}</td>
            <td className="py-1.5 font-semibold text-gray-900">{SIDO_NAME[r.code]}</td>
            <td className="py-1.5 text-right font-bold tabular-nums text-gray-900">{nf(r.visits)}</td>
            <td className="py-1.5 text-right tabular-nums text-gray-500">{pct(r.visits)}</td>
          </tr>
        ))}
        {/* 미상 행 — 지리 항목과 성격이 달라 정렬에 섞지 않고 하단 고정. 0건이어도 항상 노출. */}
        <tr className="border-t border-gray-200 bg-gray-50">
          <td className="py-1.5 text-center text-gray-500 tabular-nums">—</td>
          <td className="py-1.5 font-semibold text-gray-500">
            미상 <span className="text-[10px] text-gray-400">(지역 추정 실패)</span>
          </td>
          <td className="py-1.5 text-right font-bold tabular-nums text-gray-500">{nf(misang)}</td>
          <td className="py-1.5 text-right tabular-nums text-gray-500">{pct(misang)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * 지역별 접속 섹션 본문(카드 1장). page.tsx는 섹션 래퍼+h2 + 이 컴포넌트 1줄만 삽입한다.
 * rows === null(RPC 미적용·조회 실패)이면 hint만 유지하고 "데이터 없음" 폴백으로 graceful 렌더.
 */
export default function RegionVisitsSection({ rows }: { rows: RegionVisitRow[] | null }) {
  const cardCls = 'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm';
  const hintCls = 'text-[10px] leading-tight text-gray-400';

  if (rows === null) {
    // 데이터 없음/폴백: 페이지는 절대 깨지지 않는다(기존 카드 '-' 관례). attribution은 미표시.
    return (
      <div className={cardCls}>
        <p className={hintCls}>{HINT}</p>
        <p className="py-6 text-center text-sm text-gray-500">
          데이터 없음 — 마이그레이션 0035 적용 후 집계가 시작됩니다
        </p>
      </div>
    );
  }

  // rows → 시도별 방문수 맵 + 미상 합산. 누락 시도는 0으로 간주(표에서 0 행으로 확인 가능).
  const codes = Object.keys(SIDO_NAME) as SidoCode[];
  const visitBySido = Object.fromEntries(codes.map((c) => [c, 0])) as Record<SidoCode, number>;
  let misang = 0;
  for (const r of rows) {
    if (r.sidoCode === null) {
      misang += r.visits;
    } else if (r.sidoCode in visitBySido) {
      visitBySido[r.sidoCode as SidoCode] += r.visits;
    }
  }

  const thresholds = computeThresholds(codes.map((c) => visitBySido[c]));
  const total = codes.reduce((a, c) => a + visitBySido[c], 0) + misang;
  const ranked = codes
    .map((code) => ({ code, visits: visitBySido[code] }))
    .sort((a, b) => b.visits - a.visits || SIDO_NAME[a.code].localeCompare(SIDO_NAME[b.code], 'ko'));

  return (
    <div className={cardCls}>
      <p className={hintCls}>{HINT}</p>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 지도 열: SVG + 범례(모바일에서 표 위) */}
        <div>
          <div className="mx-auto w-full max-w-[368px]">
            <TileMapSvg visitBySido={visitBySido} misang={misang} thresholds={thresholds} />
          </div>
          <Legend t={thresholds} />
        </div>
        {/* 표 열 */}
        <div>
          <RegionTable ranked={ranked} misang={misang} total={total} />
        </div>
      </div>
      <p className={`mt-3 ${hintCls}`}>{ATTRIBUTION}</p>
    </div>
  );
}
