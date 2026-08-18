// app/(intl)/ · components/ · lib/map · lib/route 안에 남은 하드코딩 한글을 찾는다. 마이그레이션 완료 판정 기준.
// 주석은 한국어로 유지하는 게 이 저장소 관례이므로 주석 줄은 제외한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// lib/map·lib/route 도 포함한다 — 마커 라벨·경로 헬퍼가 UI 문자열을 직접 만든다.
// lib/ 전체를 넣지는 않는다: 실측 462건 중 대부분이 결제·인증 에러 메시지, SEO 콘텐츠,
// 법정 사업자 정보처럼 **번역 대상이 아닌** 것이라 0건 게이트가 다시 도달 불가능해진다.
const ROOTS = ['app/(intl)', 'components', 'lib/map', 'lib/route'];
// 번역 대상이 아닌 것 — 관리자·법정고지·결제·광고·계측.
const EXCLUDE = [
  'components/admin/', 'components/legal/', 'components/billing/',
  'components/promo/', 'components/referral/', 'components/ads/',
  'components/forecast/', 'components/notice/',
];
const HANGUL = /[가-힣]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** 따옴표 밖의 `//` 이후를 잘라낸다. 문자열 리터럴 안의 // (예: 'https://…') 는 보존한다.
 *  코드 뒤에 붙은 한국어 주석이 하드코딩 문자열로 잡히던 거짓양성을 없앤다(집 스타일 주석은 유지 대상). */
function stripTrailingComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q && line[i - 1] !== '\\') q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

let total = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (EXCLUDE.some((e) => file.startsWith(e))) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    let inBlockComment = false;
    lines.forEach((line, i) => {
      const t = line.trim();
      if (inBlockComment) {
        if (t.includes('*/')) inBlockComment = false;
        return;
      }
      if (t.startsWith('/*') || t.startsWith('{/*')) { if (!t.includes('*/')) inBlockComment = true; return; }
      if (t.startsWith('//') || t.startsWith('*')) return;
      if (!HANGUL.test(stripTrailingComment(line))) return;
      // 앞 줄에 i18n-ignore 주석이 있으면 건너뛴다(사유를 현장에 남기게 하려는 장치).
      const prev = (lines[i - 1] ?? '').trim();
      if (prev.includes('i18n-ignore')) return;
      total++;
      if (total <= 40) console.log(`${file}:${i + 1}  ${t.slice(0, 100)}`);
    });
  }
}

if (total === 0) {
  console.log('✅ (intl) 안에 하드코딩 한글 없음');
  process.exit(0);
}
console.log(`\n❌ 하드코딩 한글 ${total}건${total > 40 ? ' (상위 40건만 표시)' : ''}`);
process.exit(1);
