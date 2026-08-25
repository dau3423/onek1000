// app/(intl)/ · components/ · lib/map · lib/route 안에 남은 하드코딩 한글을 찾는다. 마이그레이션 완료 판정 기준.
// 주석은 한국어로 유지하는 게 이 저장소 관례이므로 주석 줄은 제외한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// lib/map·lib/route 도 포함한다 — 마커 라벨·경로 헬퍼가 UI 문자열을 직접 만든다.
// hooks/ 도 포함한다 — useGeolocation 등 훅이 컴포넌트에 그대로 노출되는 문자열을 만든다(§최종 리뷰 I3).
// lib/inapp.ts 는 파일 단위로 추가한다 — inAppKindLabel 류가 번역된 문장에 보간되던 leak(§I3).
// lib/ 전체를 넣지는 않는다: 실측 462건 중 대부분이 결제·인증 에러 메시지, SEO 콘텐츠,
// 법정 사업자 정보처럼 **번역 대상이 아닌** 것이라 0건 게이트가 다시 도달 불가능해진다.
const ROOTS = ['app/(intl)', 'components', 'hooks', 'lib/map', 'lib/route', 'lib/inapp.ts'];
// 번역 대상이 아닌 것 — 파일 단위로 고른다(디렉터리 단위 EXCLUDE는 실제로 (intl) 안에서
// 렌더되는 파일을 숨겨 세 번 사고가 났다: i18n-ignore 절반짜리 사유 → 디렉터리명 기준 EXCLUDE →
// legal/referral/billing 디렉터리 통째 제외. 이제부터는 각 파일이 어디서 렌더되는지 확인하고
// 그 근거를 여기 적는다). 감사 결과는 .superpowers/sdd/plan/fixwave-report.md 참고.
const EXCLUDE = [
  // app/admin(관리자 전용, (intl) 밖) 에서만 쓰인다.
  'components/admin/RegionTileMap.tsx',
  // 죽은 코드 — app/(intl)/page.tsx 의 import가 주석 처리되어 있어 현재 아무 데서도 렌더되지 않는다.
  // 되살리는 순간(주석 해제) 이 예외도 함께 지우고 번역해야 한다.
  'components/promo/WelcomePromo.tsx',
  // app/pricing/page.tsx((intl) 밖, 결제 플로우)에서만 쓰인다.
  'components/billing/SubscribeButton.tsx',
  // app/billing/success/page.tsx((intl) 밖, 결제 완료 플로우)에서만 쓰인다.
  'components/billing/SessionRefresher.tsx',
  // app/layout.tsx(루트 레이아웃, (intl) 밖)에 전역 마운트된다 — provider 밖.
  'components/referral/ReferralClaim.tsx',
  // app/regions/**((intl) 밖, SEO 지역 랜딩)에서만 쓰인다. 그 트리는 한국어 전용이고
  // next-intl provider 도 없어 useTranslations 를 쓸 수 없다(같은 이유로 앱 헤더도 재사용 못 한다).
  'components/regions/MapCta.tsx',
  'components/regions/RegionMapLink.tsx',
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

/** ROOTS 항목은 디렉터리 또는 단일 파일일 수 있다(lib/inapp.ts 처럼 lib/ 전체를 끌어들이지 않고
 *  파일 하나만 넣고 싶은 경우). */
function filesUnder(root) {
  return statSync(root).isDirectory() ? walk(root) : [root];
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
  for (const file of filesUnder(root)) {
    if (EXCLUDE.includes(file)) continue;
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
