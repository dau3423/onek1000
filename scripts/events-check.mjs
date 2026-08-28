// 계측 이벤트 화이트리스트 정합성 검사.
//
// 왜 필요한가: app/api/event/route.ts 의 ALLOWED_EVENTS 에 없는 이벤트는 **200 을 돌려주면서
// 조용히 버려진다**. 클라이언트는 정상 발신하고 네트워크 탭도 200 이라 사람 눈으로는 못 잡는다.
// 실제로 그렇게 5개가 새고 있었다(2026-08-28 발견):
//   layer_more_open / layer_select_from_more — 필터바 재설계 때부터
//   place_click / sheet_open / layer_select   — 2026-08-26 배포 때부터
// 브라우저에서 발신을 확인해도 소용없었다 — 검증하느라 /api/event 를 스텁했더니
// 정작 고장난 서버 판정을 통째로 건너뛰었다. 그래서 사람이 아니라 이 스크립트가 잡는다.
//
// 실행: npm run events:check  (i18n:check 와 같은 위치의 게이트)

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROUTE = 'app/api/event/route.ts';
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib'];

/** 코드에서 실제로 발신하는 이벤트 이름. track('foo') 형태만 센다. */
function usedEvents() {
  const out = execSync(
    `grep -rhoE "track\\('[a-z_]+'" ${SCAN_DIRS.join(' ')} || true`,
    { encoding: 'utf8' },
  );
  return new Set(
    out.split('\n').filter(Boolean).map((m) => m.split("'")[1]),
  );
}

/** ALLOWED_EVENTS Set 리터럴 안의 이름들. */
function allowedEvents() {
  const src = readFileSync(ROUTE, 'utf8');
  const start = src.indexOf('const ALLOWED_EVENTS');
  if (start < 0) throw new Error(`${ROUTE} 에서 ALLOWED_EVENTS 를 찾지 못했다`);
  const end = src.indexOf('])', start);
  if (end < 0) throw new Error(`${ROUTE} 의 ALLOWED_EVENTS 끝을 찾지 못했다`);
  return new Set([...src.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
}

const used = usedEvents();
const allowed = allowedEvents();

// 치명적: 발신하는데 서버가 버린다 → 계측이 조용히 죽는다.
const dropped = [...used].filter((e) => !allowed.has(e)).sort();
// 경고: 화이트리스트에만 있고 아무도 안 보낸다 → 제거된 기능의 잔재일 수 있다(빌드는 막지 않는다).
const stale = [...allowed].filter((e) => !used.has(e)).sort();

if (dropped.length > 0) {
  console.error('❌ 발신하지만 ALLOWED_EVENTS 에 없어 서버에서 폐기됩니다:');
  for (const e of dropped) console.error(`   ${e}`);
  console.error(`\n   → ${ROUTE} 의 ALLOWED_EVENTS 에 추가하세요.`);
  process.exit(1);
}

if (stale.length > 0) {
  console.warn('⚠️  ALLOWED_EVENTS 에 있으나 코드에서 발신하지 않음(제거 검토):');
  for (const e of stale) console.warn(`   ${e}`);
}

console.log(`✅ 계측 이벤트 정합성 OK (발신 ${used.size} / 허용 ${allowed.size})`);
