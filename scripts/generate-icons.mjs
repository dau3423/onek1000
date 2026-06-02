// Onek 앱 아이콘 시리즈 생성기
//
// 사용법:  npm run icons
//
// 입력:  public/favicon.png  (고해상 정사각 원본, 권장 1024px↑)
// 출력:  public/icons/*.png + public/favicon.ico
//
// 처리 방식:
//   - 일반 아이콘(favicon-16/32/48, apple-touch-icon, icon-192/512, favicon.ico):
//       favicon.png를 fit:'contain' + 투명 배경으로 각 크기에 맞춰 다운스케일.
//   - maskable 아이콘(icon-512-maskable.png):
//       안드로이드 mask에서 가장자리가 잘리지 않도록 안전영역(safe zone)을 확보.
//       원본을 512의 약 80%(410px)로 축소해 중앙 배치하고, 여백은 흰색(#ffffff)
//       불투명 배경으로 채워 512×512로 출력. (manifest background_color와 일치)
//
// 의존성: sharp (devDependencies). macOS는 prebuilt 바이너리라 추가 설치 불필요.

import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SRC          = resolve(ROOT, 'public/favicon.png');
const OUT_DIR      = resolve(ROOT, 'public/icons');
const FAVICON_OUT  = resolve(ROOT, 'public/favicon.ico');

// maskable 안전영역 설정
const MASKABLE_SIZE = 512;
const MASKABLE_INNER = 410; // 약 80% — 가장자리 mask 대비 여백 확보
const THEME_COLOR = { r: 0xff, g: 0x6b, b: 0x00, alpha: 1 }; // #FF6B00 (manifest theme_color, 상태바/스플래시용)
const MASKABLE_BG = { r: 255, g: 255, b: 255, alpha: 1 }; // #ffffff (maskable 여백 배경, manifest background_color와 일치)

mkdirSync(OUT_DIR, { recursive: true });

// 투명 배경으로 다운스케일하는 일반 아이콘 목록
const targets = [
  { name: 'favicon-16.png',       size: 16 },
  { name: 'favicon-32.png',       size: 32 },
  { name: 'favicon-48.png',       size: 48 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png',         size: 192 },
  { name: 'icon-512.png',         size: 512 },
];

console.log('Onek 아이콘 생성 시작...\n');

for (const t of targets) {
  const out = resolve(OUT_DIR, t.name);
  await sharp(SRC)
    .resize(t.size, t.size, { fit: 'contain', background: { r: 255, g: 107, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ✓ ${t.name.padEnd(28)} (${t.size}×${t.size})`);
}

// maskable — 안전영역 확보: 410px로 축소 후 512 흰색 캔버스 중앙 합성
// 여백은 흰색(#ffffff) 배경으로 채움 (manifest background_color와 일치, seam 없음)
{
  const out = resolve(OUT_DIR, 'icon-512-maskable.png');
  const inner = await sharp(SRC)
    .resize(MASKABLE_INNER, MASKABLE_INNER, { fit: 'contain', background: { ...MASKABLE_BG, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: MASKABLE_SIZE,
      height: MASKABLE_SIZE,
      channels: 4,
      background: MASKABLE_BG,
    },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ✓ ${'icon-512-maskable.png'.padEnd(28)} (${MASKABLE_SIZE}×${MASKABLE_SIZE}, safe-zone ${MASKABLE_INNER}px + #ffffff 배경)`);
}

// favicon.ico — sharp는 ico를 직접 못 만들어서 32×32 PNG를 favicon.ico로 출력 (모던 브라우저는 PNG ico도 인식)
// 더 정확한 ico가 필요하면 별도 ico 라이브러리 사용
{
  await sharp(SRC)
    .resize(32, 32, { fit: 'contain', background: { r: 255, g: 107, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(FAVICON_OUT);
  console.log(`  ✓ favicon.ico (실제로는 32×32 PNG, 모던 브라우저 호환)`);
}

console.log('\n완료. public/icons/ 와 public/favicon.ico 확인.\n');
