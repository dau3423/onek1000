// app/(intl)/ 안에 남은 하드코딩 한글을 찾는다. 마이그레이션 완료 판정 기준.
// 주석은 한국어로 유지하는 게 이 저장소 관례이므로 주석 줄은 제외한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['app/(intl)'];
const HANGUL = /[가-힣]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

let total = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let inBlockComment = false;
    lines.forEach((line, i) => {
      const t = line.trim();
      if (inBlockComment) {
        if (t.includes('*/')) inBlockComment = false;
        return;
      }
      if (t.startsWith('/*')) { if (!t.includes('*/')) inBlockComment = true; return; }
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('{/*')) return;
      if (!HANGUL.test(line)) return;
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
