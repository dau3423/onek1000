// ko.json 을 원본으로 삼아 나머지 로케일의 키 누락·잉여를 검사한다. 번역 완료 판정 기준.
// 값이 빈 문자열인 키도 "미번역"으로 잡는다 — 키만 만들어두고 번역을 안 채운 상태를 놓치지 않기 위해.
import { readFileSync } from 'node:fs';

// 로케일 목록은 i18n/config.ts 에서 파생한다 — 하드코딩하면 단일 출처가 둘로 갈린다.
// (.mjs 에서 .ts 를 import 할 수 없으므로 정규식으로 읽는다.)
const CONFIG_SRC = readFileSync(new URL('../i18n/config.ts', import.meta.url), 'utf8');
const LOCALES = [...(CONFIG_SRC.match(/export const LOCALES = \[([^\]]*)\]/)?.[1] ?? '')
  .matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
if (LOCALES.length === 0) {
  console.error('❌ i18n/config.ts 에서 LOCALES 를 읽지 못했다 — 검사기를 고칠 것');
  process.exit(1);
}
const BASE = 'ko';

const load = (l) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));

/** 중첩 객체를 "a.b.c" 평탄 키 맵으로 */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const base = flatten(load(BASE));
const baseKeys = Object.keys(base);
let failed = false;

console.log(`기준(${BASE}) 키: ${baseKeys.length}개\n`);

for (const locale of LOCALES.filter((l) => l !== BASE)) {
  const cur = flatten(load(locale));
  const missing = baseKeys.filter((k) => !(k in cur));
  const extra = Object.keys(cur).filter((k) => !(k in base));
  const empty = baseKeys.filter((k) => k in cur && String(cur[k]).trim() === '');

  const bad = missing.length + extra.length + empty.length;
  if (bad === 0) {
    console.log(`✅ ${locale}: 완료 (${baseKeys.length}/${baseKeys.length})`);
    continue;
  }
  failed = true;
  console.log(`❌ ${locale}: 누락 ${missing.length} · 잉여 ${extra.length} · 빈값 ${empty.length}`);
  for (const k of missing.slice(0, 20)) console.log(`   누락 ${k}`);
  for (const k of extra.slice(0, 20)) console.log(`   잉여 ${k}`);
  for (const k of empty.slice(0, 20)) console.log(`   빈값 ${k}`);
  if (bad > 60) console.log(`   … 외 ${bad - 60}건`);
}

process.exit(failed ? 1 : 0);
