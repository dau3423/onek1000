// 서울(asia-northeast3) Cloud Run 전용 HTTP 서버 — 고속도로 주유소 sync.
// Node 내장 http 모듈만 사용(express 등 신규 의존성 불필요).
//
// 인증: Authorization: `Bearer ${CRON_SECRET}` (기존 /api/internal/sync-highway 라우트와 동일).
//   불일치/누락 시 403. Cloud Run 은 --allow-unauthenticated 로 두되 이 Bearer 검사로 보호한다
//   (트레이드오프: 공개 엔드포인트지만 CRON_SECRET 을 모르면 403. 기존 cron 라우트와 동일 패턴).
//
// 요청: POST(경로 무관). GET 도 동일 처리(기존 라우트의 GET→POST 위임과 동일 편의).
// 응답: JSON 요약(ok, fetched, stationUpserts, priceUpserts, geocoded, coordCached, coordSkipped).
//   ?dryRun=1 쿼리로 upsert 생략(수집/지오코딩까지만 — 스모크 확인용).

import { createServer } from 'node:http';
import { runHighwaySync } from './sync.js';

const PORT = Number(process.env.PORT) || 8080;

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(json);
}

const server = createServer(async (req, res) => {
  // 헬스체크용: 인증 없는 GET / 은 간단 OK(스케줄러는 POST + Bearer 로 호출).
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // 인증 검사 — CRON_SECRET 미설정 시(배포 실수) 모든 요청 거부.
  const auth = req.headers['authorization'] ?? '';
  const secret = process.env.CRON_SECRET;
  const authorized = Boolean(secret) && auth === `Bearer ${secret}`;

  // 인증 없는 GET / → 가벼운 헬스 응답(민감정보 없음).
  if (req.method === 'GET' && url.pathname === '/' && !auth) {
    return send(res, 200, { service: 'highway-sync', ok: true });
  }

  if (!authorized) {
    return send(res, 403, { error: 'forbidden' });
  }

  const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dryRun') === 'true';

  try {
    const result = await runHighwaySync({ dryRun });
    const status = result.error ? 500 : 200;
    return send(res, status, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return send(res, 500, { error: msg });
  }
});

server.listen(PORT, () => {
  console.log(`[highway-sync] listening on :${PORT}`);
});
