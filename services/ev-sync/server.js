// 서울(asia-northeast3) Cloud Run 전용 HTTP 서버 — 전기차 충전소 sync.
// highway-sync/server.js, repair-sync/server.js 와 같은 구조·같은 인증 규약을 따른다.
//
// 왜 서울인가: data.go.kr 이 해외 IP 를 차단해, App Hosting(싱가포르)에서 호출하면 항상
//   fetch failed 가 난다(실측 2026-08-22: 운영 3/3 실패, 각 10.7초 / 한국 IP 는 0.04초에 200).
//   EvCharger 는 `https://apis.data.go.kr/B552584/EvCharger` 로 같은 IP(27.101.236.63)를 쓴다.
//   한국도로공사 API(highway-sync), 정비소 API(repair-sync) 에 이어 세 번째 같은 조치다.
//
// 인증: Authorization: `Bearer ${CRON_SECRET}` — 불일치/누락 시 403.
// 요청: POST(경로 무관). 쿼리 파라미터
//   ?dryRun=1     쓰기(upsert/정리/커서저장) 전부 생략, 수집·정규화만 하고 통계 반환
//   ?zcode=11     그 시도 하나만 sync(수동/지역별 적재용)
//   ?maxPages=N   시도당 페이지 상한(스모크 테스트용)
//   ?budgetMs=N   이번 호출의 시간예산(기본 3300초 — Cloud Run --timeout 3600 기준)

import { createServer } from 'node:http';
import { runEvSync, EV_ZCODES } from './sync.js';

const PORT = Number(process.env.PORT) || 8080;

// 전국 1바퀴가 20분 안팎이라, Scheduler 재시도(attempt-deadline 초과)나 수동 호출이 겹칠 수 있다.
// 두 실행이 동시에 돌면 같은 커서를 서로 덮어써 페이지를 건너뛴다 — 한 번에 하나만 돌린다.
// (Cloud Run 은 --max-instances=1 로 배포해 인스턴스 간 중복까지 막는다.)
let inFlight = null;

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
    return send(res, 200, { service: 'ev-sync', ok: true });
  }
  if (!authorized) return send(res, 403, { error: 'forbidden' });

  const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dryRun') === 'true';

  const zcode = url.searchParams.get('zcode')?.trim() || null;
  if (zcode && !EV_ZCODES.includes(zcode)) {
    return send(res, 400, { error: `invalid zcode: ${zcode}`, validZcodes: EV_ZCODES });
  }

  const mp = Number(url.searchParams.get('maxPages'));
  const maxPages = Number.isFinite(mp) && mp > 0 ? Math.trunc(mp) : undefined;

  const bm = Number(url.searchParams.get('budgetMs'));
  const budgetMs = Number.isFinite(bm) && bm > 0 ? Math.trunc(bm) : undefined;

  // dryRun 은 아무것도 쓰지 않으니 겹쳐도 무해 — 잠금 대상은 실제 쓰기 실행뿐이다.
  if (!dryRun && inFlight) {
    return send(res, 409, { error: 'already running', hint: '이미 sync 가 진행 중이다. 커서가 있으니 다음 실행이 이어받는다.' });
  }

  const run = runEvSync({
    dryRun,
    ...(zcode ? { zcode } : {}),
    ...(maxPages ? { maxPages } : {}),
    ...(budgetMs ? { budgetMs } : {}),
  });
  if (!dryRun) inFlight = run;

  try {
    const result = await run;
    return send(res, result.ok ? 200 : 500, result);
  } catch (e) {
    return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  } finally {
    if (inFlight === run) inFlight = null;
  }
});

server.listen(PORT, () => console.log(`[ev-sync] listening on :${PORT}`));
