#!/usr/bin/env node
// GeoLite2-City mmdb 다운로드 스크립트 — 운영자 전용, 빌드와 무관한 독립 실행형.
//
// 사용법:
//   MAXMIND_LICENSE_KEY=xxxx npm run geoip:download
//
// 동작: MaxMind 다운로드 엔드포인트에서 GeoLite2-City를 tar.gz로 받아 압축을 풀고,
//   data/geoip/GeoLite2-City.mmdb 로 저장한다(lib/geoip/lookup.ts 기본 경로 GEOIP_DB_PATH와 일치).
//
// 주의: MAXMIND_LICENSE_KEY가 없으면 안내 후 비정상 종료(exit 1)한다. 이 스크립트는 build/CI에
//   자동 연결하지 않는다 — 실제 DB 도입·배포 반영은 운영자 몫이다(docs/운영_GeoIP_도입절차.md).

import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import https from 'node:https';

const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY;
const OUT_DIR = process.env.GEOIP_OUT_DIR || join(process.cwd(), 'data', 'geoip');
const OUT_FILE = join(OUT_DIR, 'GeoLite2-City.mmdb');

if (!LICENSE_KEY) {
  console.error(
    [
      '[geoip:download] MAXMIND_LICENSE_KEY 가 설정되지 않았습니다.',
      '',
      '  1) https://www.maxmind.com 에서 무료 계정 생성 후 License Key를 발급받으세요.',
      '  2) 다음처럼 키를 전달해 다시 실행하세요:',
      '       MAXMIND_LICENSE_KEY=발급받은키 npm run geoip:download',
      '',
      '  * 이 스크립트는 빌드에 연결되지 않습니다. DB 도입·배포 반영은 운영자 몫입니다.',
      '    자세한 절차: docs/운영_GeoIP_도입절차.md',
    ].join('\n'),
  );
  process.exit(1);
}

const url =
  'https://download.maxmind.com/app/geoip_download' +
  `?edition_id=GeoLite2-City&license_key=${encodeURIComponent(LICENSE_KEY)}&suffix=tar.gz`;

// 리다이렉트를 따라가며 파일로 저장.
function download(fromUrl, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('리다이렉트가 너무 많습니다.'));
    https
      .get(fromUrl, (res) => {
        const { statusCode, headers } = res;
        if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          return resolve(download(headers.location, dest, redirects + 1));
        }
        if (statusCode !== 200) {
          res.resume();
          return reject(
            new Error(
              `다운로드 실패(HTTP ${statusCode}). License Key가 유효한지, GeoLite2 이용 약관에 동의했는지 확인하세요.`,
            ),
          );
        }
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const work = join(tmpdir(), `geolite2-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  const tarPath = join(work, 'GeoLite2-City.tar.gz');

  console.log('[geoip:download] GeoLite2-City 다운로드 중…');
  await download(url, tarPath);

  console.log('[geoip:download] 압축 해제 중…');
  execFileSync('tar', ['-xzf', tarPath, '-C', work]);

  // 추출된 GeoLite2-City_YYYYMMDD/GeoLite2-City.mmdb 를 찾아 OUT_FILE로 이동.
  const sub = readdirSync(work).find((d) => d.startsWith('GeoLite2-City'));
  const mmdb = sub ? join(work, sub, 'GeoLite2-City.mmdb') : null;
  if (!mmdb || !existsSync(mmdb)) {
    rmSync(work, { recursive: true, force: true });
    throw new Error('압축 결과에서 GeoLite2-City.mmdb 를 찾지 못했습니다.');
  }
  rmSync(OUT_FILE, { force: true });
  renameSync(mmdb, OUT_FILE);
  rmSync(work, { recursive: true, force: true });

  console.log(`[geoip:download] 완료: ${OUT_FILE}`);
  console.log('  배포에 이 파일을 포함하거나 GEOIP_DB_PATH 로 경로를 지정하세요.');
}

main().catch((err) => {
  console.error(`[geoip:download] 오류: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
