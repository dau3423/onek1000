// 서울(asia-northeast3) Cloud Run 전용 HTTP 서버 — 자동차 정비소 sync.
// highway-sync/server.js 와 같은 구조·같은 인증 규약을 따른다.
//
// 왜 서울인가: data.go.kr 이 해외 IP 를 차단해, App Hosting(싱가포르)에서 호출하면 항상
//   fetch failed 가 난다(3/3 실측, 각 10.7초). 한국 IP 에서는 0.04초에 200.
//   한국도로공사 API 로 같은 문제를 겪어 highway-sync 를 분리한 전례를 그대로 따랐다.
//
// 인증: Authorization: `Bearer ${CRON_SECRET}` — 불일치/누락 시 403.
// 요청: POST(경로 무관). ?dryRun=1 로 쓰기 생략, ?maxPages=N 으로 페이지 제한.

import { createServer } from 'node:http';
import { runRepairSync } from './sync.js';

const PORT = Number(process.env.PORT) || 8080;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const auth = req.headers['authorization'] ?? '';
  const secret = process.env.CRON_SECRET;
  const authorized = Boolean(secret) && auth === `Bearer ${secret}`;

  // 인증 없는 GET / → 헬스 응답(민감정보 없음).
  if (req.method === 'GET' && url.pathname === '/' && !auth) {
    return send(res, 200, { service: 'repair-sync', ok: true });
  }
  if (!authorized) return send(res, 403, { error: 'forbidden' });

  const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dryRun') === 'true';
  const mp = Number(url.searchParams.get('maxPages'));
  const maxPages = Number.isFinite(mp) && mp > 0 ? Math.trunc(mp) : undefined;

  try {
    const result = await runRepairSync({ dryRun, ...(maxPages ? { maxPages } : {}) });
    return send(res, result.error ? 500 : 200, result);
  } catch (e) {
    return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => console.log(`[repair-sync] listening on :${PORT}`));
