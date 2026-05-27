// Onek 앱 아이콘 시리즈 생성기
//
// 사용법:  npm run icons
//
// 입력:  public/icons/source.svg, public/icons/source-maskable.svg
// 출력:  public/icons/*.png + public/favicon.ico
//
// 의존성: sharp (devDependencies). macOS는 prebuilt 바이너리라 추가 설치 불필요.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SRC          = resolve(ROOT, 'public/icons/source.svg');
const SRC_MASKABLE = resolve(ROOT, 'public/icons/source-maskable.svg');
const OUT_DIR      = resolve(ROOT, 'public/icons');
const FAVICON_OUT  = resolve(ROOT, 'public/favicon.ico');

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { name: 'favicon-16.png',         size: 16,  source: SRC },
  { name: 'favicon-32.png',         size: 32,  source: SRC },
  { name: 'favicon-48.png',         size: 48,  source: SRC },
  { name: 'apple-touch-icon.png',   size: 180, source: SRC },
  { name: 'icon-192.png',           size: 192, source: SRC },
  { name: 'icon-512.png',           size: 512, source: SRC },
  { name: 'icon-512-maskable.png',  size: 512, source: SRC_MASKABLE },
];

const svgFor = new Map();
function loadSvg(path) {
  if (!svgFor.has(path)) svgFor.set(path, readFileSync(path));
  return svgFor.get(path);
}

console.log('Onek 아이콘 생성 시작...\n');

for (const t of targets) {
  const buf = loadSvg(t.source);
  const out = resolve(OUT_DIR, t.name);
  await sharp(buf, { density: 512 })
    .resize(t.size, t.size, { fit: 'contain', background: { r: 255, g: 107, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ✓ ${t.name.padEnd(28)} (${t.size}×${t.size})`);
}

// favicon.ico — 16/32/48 멀티 사이즈
// sharp는 ico를 직접 못 만들어서, 가장 일반적인 32×32 PNG를 favicon.ico로도 복사 (모던 브라우저는 PNG ico도 인식)
// 더 정확한 ico가 필요하면 별도 ico 라이브러리 사용
{
  const buf = loadSvg(SRC);
  await sharp(buf, { density: 512 })
    .resize(32, 32)
    .png({ compressionLevel: 9 })
    .toFile(FAVICON_OUT);
  console.log(`  ✓ favicon.ico (실제로는 32×32 PNG, 모던 브라우저 호환)`);
}

console.log('\n완료. public/icons/ 와 public/favicon.ico 확인.\n');
