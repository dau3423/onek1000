// lib/sigungu-data.ts 갱신 — 운영 stations 에서 새로 확정 가능한 시군구를 **덧붙인다**.
//
// 왜 필요한가: 정적 파일이 211개인데 DB 에는 233개 코드가 있었다. 빠진 것 중에는
// **2026년 인천 행정구역 개편으로 신설된 제물포구·영종구·서해구·검단구**가 있었다.
// 이 표는 지역 랜딩(/regions/…)과 주소→시군구 매칭(lib/regions/addressMatch.ts)이 쓰므로,
// 빠진 시군구는 랜딩 페이지가 아예 생기지 않고 정비소·세차장·EV 주소도 매칭되지 않는다.
// 행정구역은 바뀐다 — 일회성 스냅샷이 아니라 재실행 가능한 스크립트로 남긴다.
//
// **덮어쓰기가 아니라 병합**이다. stations.address 는 58.6%(6,295/10,742)가 null 인데
// 이건 결함이 아니라 설계다: backfill-stations 는 Opinet aroundAll 로 회색 점용 "위치 행"만
// 넣고, aroundAll 응답에는 주소가 없다. 그래서 지금 주소로 이름을 확정할 수 있는 코드는
// 196개뿐이고, 전면 재생성하면 과거에 이름이 붙은 15개가 조용히 사라진다. 기존 항목은
// 그대로 두고 새로 확정된 것만 추가한다.
//
// 오매칭 0 원칙: 시/군/구 접미사가 붙은 표기만 이름 후보로 인정하고 최빈값을 쓴다.
// opinet 주소에는 '충북 영동 용산 …'처럼 접미사가 빠진 표기가 섞여 있는데, 이런 코드는
// 추측해서 '영동군'이라 붙이지 않고 **보류**한다(스크립트가 보류 목록을 출력한다).
//
// 실행:  node scripts/gen-sigungu-data.mjs      (.env.local 의 Supabase 자격증명 사용, 읽기만)
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const FILE = 'lib/sigungu-data.ts';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).replace(/\s+#.*$/, '').trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** types/station.ts 의 SIDO_NAME 과 같아야 한다. 세종(19)은 시군구가 없어 시도 페이지가 커버 → 제외. */
const SIDO_CODES = new Set(['01','02','03','04','05','06','07','08','09','10','11','14','15','16','17','18']);

/** 주소 첫머리의 시도 표기. 긴 표기부터 시도해야 '경기'가 '경기도'를 먼저 자르지 않는다. */
const SIDO_PREFIXES = [
  '서울특별시','서울시','서울','경기도','경기','강원특별자치도','강원도','강원','충청북도','충북',
  '충청남도','충남','전북특별자치도','전라북도','전북','전라남도','전남','경상북도','경북','경상남도','경남',
  '부산광역시','부산시','부산','제주특별자치도','제주도','제주','대구광역시','대구시','대구',
  '인천광역시','인천시','인천','광주광역시','광주시','광주','대전광역시','대전시','대전',
  '울산광역시','울산시','울산','세종특별자치시','세종시','세종',
].sort((a, b) => b.length - a.length);

function sigunguToken(address) {
  let s = String(address ?? '').trim();
  if (!s) return null;
  for (const p of SIDO_PREFIXES) {
    if (s.startsWith(p)) { s = s.slice(p.length).trim(); break; }
  }
  return s.split(/\s+/)[0] || null;
}

// 기존 항목 — 예전 포맷("code": "0101")과 새 포맷(code: '0101') 둘 다 읽는다.
const src = fs.readFileSync(FILE, 'utf8');
const existing = [...src.matchAll(/["']?code["']?:\s*["'](\d{4})["'],\s*["']?sido["']?:\s*["'](\d{2})["'],\s*["']?name["']?:\s*["']([^"']+)["']/g)]
  .map((m) => ({ code: m[1], sido: m[2], name: m[3] }));
if (existing.length === 0) throw new Error(`${FILE} 에서 기존 항목을 읽지 못했다 — 포맷 확인 필요`);

const rows = [];
for (let from = 0; ; from += 1000) {
  // .select() 는 range 없이는 1000행에서 끊긴다 — 전국을 보려면 반드시 페이지네이션한다.
  const { data, error } = await sb.from('stations').select('sigungu_code, address').range(from, from + 999);
  if (error) throw new Error(error.message);
  rows.push(...data);
  if (data.length < 1000) break;
}

const named = new Map();     // code → Map(name → count)  (접미사 있는 표기만)
const pending = new Map();   // code → 접미사 없는 최빈 표기
for (const r of rows) {
  const code = r.sigungu_code;
  if (!code || !/^\d{4}$/.test(code) || !SIDO_CODES.has(code.slice(0, 2))) continue;
  const t = sigunguToken(r.address);
  if (!t) continue;
  if (/(시|군|구)$/.test(t)) {
    if (!named.has(code)) named.set(code, new Map());
    const m = named.get(code);
    m.set(t, (m.get(t) ?? 0) + 1);
  } else if (!pending.has(code)) {
    pending.set(code, t);
  }
}

const have = new Set(existing.map((e) => e.code));
const added = [];
for (const [code, m] of named) {
  if (have.has(code)) continue;
  const [name, n] = [...m].sort((a, b) => b[1] - a[1])[0];
  added.push({ code, sido: code.slice(0, 2), name, n });
}
const merged = [...existing, ...added.map(({ code, sido, name }) => ({ code, sido, name }))]
  .sort((a, b) => a.code.localeCompare(b.code));

const header = `// 시군구 코드(opinet AREA_CD 4자리) ↔ 시도/한글이름 정적 매핑.
// **자동 생성 — 직접 고치지 말 것.** 갱신: node scripts/gen-sigungu-data.mjs
//
// 운영 stations 전체(페이지네이션)에서 주소의 시군구 토큰 최빈값으로 이름을 정하고,
// 기존 항목에 **덧붙인다**(덮어쓰지 않는다 — 스크립트 상단 주석의 이유 참고).
// opinet은 기초자치단체 단위라 시 산하 일반구(예: 수원시 팔달구)는 시(수원시)로 묶인다.
// 세종은 시군구가 없어 시도 페이지가 커버 → 제외.
import type { SidoCode } from '@/types/station';

export interface Sigungu {
  code: string;   // opinet AREA_CD 4자리 (stations.sigungu_code)
  sido: SidoCode; // 코드 앞 2자리
  name: string;   // 한글 기초자치단체명 (예: 종로구, 수원시 — 시 산하 일반구는 시로 묶임)
}

export const SIGUNGU: Sigungu[] = [
`;
fs.writeFileSync(FILE, header + merged.map((e) => `  { code: '${e.code}', sido: '${e.sido}', name: '${e.name}' },`).join('\n') + '\n];\n');

console.log(`기존 ${existing.length}개 + 신규 ${added.length}개 = ${merged.length}개`);
for (const a of added) console.log(`  + ${a.code} ${a.name} (주소 ${a.n}건)`);
const held = [...pending.keys()].filter((c) => !named.has(c) && !have.has(c));
if (held.length) {
  console.log('보류(접미사 없는 표기뿐 — 추측하지 않는다):');
  for (const c of held) console.log(`  ? ${c} → '${pending.get(c)}'`);
}
