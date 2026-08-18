// ko.json 을 원본으로 삼아 나머지 로케일의 키 누락·잉여를 검사한다. 번역 완료 판정 기준.
// 값이 빈 문자열인 키도 "미번역"으로 잡는다 — 키만 만들어두고 번역을 안 채운 상태를 놓치지 않기 위해.
import { readFileSync } from 'node:fs';
// ICU 파싱 검사용 — next-intl 이 이미 의존성으로 가져온 패키지라 추가 설치가 필요 없다.
// `'` 뒤에 `<`/`{`/`#` 가 오면 인용 모드가 열려 태그가 문자열로 먹히는 부류(UNCLOSED_TAG 등)를 잡는다.
import { parse as parseIcu } from '@formatjs/icu-messageformat-parser';

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

// ── 라벨 정합성: types/*.ts 상수와 ko.json labels 가 어긋나면 SSG 페이지와 (intl) 화면의
//    한국어 문구가 갈린다. 상수를 지우지 않기로 했으므로(계획 "명세에서 바뀐 점") 여기서 묶어 둔다.
//    PRODUCT_LABEL·BRAND_LABEL·SIDO_NAME(types/station.ts) 세 가족을 검사한다.
//    WASH_TYPE_LABEL(types/carwash.ts)은 Task 12에서 소비자가 없어 삭제됐다 — 대응 상수가
//    더는 없으므로 labels.washType 은 이 드리프트 검사 대상에서 빠진다(의도된 결과, 미검사 아님).
{
  const srcCache = {};
  const readSrc = (relPath) => {
    if (!(relPath in srcCache)) {
      srcCache[relPath] = readFileSync(new URL(relPath, import.meta.url), 'utf8');
    }
    return srcCache[relPath];
  };
  const block = (src, name) => {
    const m = src.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
    if (!m) return null;
    const out = {};
    // 2~10자, 대소문자 모두 허용: 코드 키('01', B027, SKE)를 잡는다.
    for (const mm of m[1].matchAll(/'?([A-Za-z0-9]{2,10})'?\s*:\s*'([^']*)'/g)) out[mm[1]] = mm[2];
    return out;
  };
  const pairs = [
    ['PRODUCT_LABEL', 'labels.product', '../types/station.ts'],
    ['BRAND_LABEL', 'labels.brand', '../types/station.ts'],
    ['SIDO_NAME', 'labels.sido', '../types/station.ts'],
  ];
  const checked = [];
  for (const [constName, ns, file] of pairs) {
    const consts = block(readSrc(file), constName);
    if (!consts) { failed = true; console.log(`❌ ${constName} 파싱 실패 — 검사를 건너뛸 수 없음(하드 실패 처리)`); continue; }
    checked.push(`${ns}(${Object.keys(consts).length})`);
    for (const [code, val] of Object.entries(consts)) {
      const key = `${ns}.${code}`;
      if (base[key] !== val) {
        failed = true;
        console.log(`❌ 라벨 불일치 ${key}: 상수="${val}" ko.json="${base[key] ?? '(없음)'}"`);
      }
    }
  }
  if (!failed) console.log(`✅ 상수 ↔ ko.json 라벨 일치: ${checked.join(', ')}`);
}

// ── ICU 파싱: 카탈로그 4개 로케일 전체를 @formatjs 파서로 실제 파싱해 본다.
//    key 파리티·라벨 드리프트와 달리 이건 "문법이 유효한가"만 본다 — UNCLOSED_TAG 류를
//    영구히 막는다(§I1, 어포스트로피가 </> 앞에서 ICU 인용을 여는 버그).
{
  let icuBad = 0;
  for (const locale of LOCALES) {
    const flat = flatten(load(locale));
    for (const [key, value] of Object.entries(flat)) {
      if (typeof value !== 'string') continue;
      try {
        parseIcu(value);
      } catch (e) {
        failed = true;
        icuBad++;
        console.log(`❌ ICU 파싱 실패 ${locale}.${key}: ${e.message} :: "${value}"`);
      }
    }
  }
  if (icuBad === 0) console.log(`✅ ICU 파싱: ${LOCALES.length}개 로케일 전체 유효`);
}

process.exit(failed ? 1 : 0);
