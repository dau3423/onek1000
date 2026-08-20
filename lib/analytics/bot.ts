// 봇·크롤러 User-Agent 판별 — 방문/퍼널 집계에서 제외하기 위한 것.
//
// 왜 필요한가: page_visits 에는 UA 필터가 없었다. 그래서 "하루 200명"에 검색엔진 크롤러,
// 링크 미리보기 봇(카카오톡·페이스북이 URL 을 펼칠 때 긁는다), 모니터링 도구가 전부 섞여 있었다.
// 실측 정황(2026-08-20 기준 30일): 유입의 92%가 레퍼러 없음이고, 3,321개 기기 중 이틀 이상
// 방문한 기기는 16개(0.5%)였다 — 사람이라면 나오기 어려운 분포다.
//
// 판단 기준: 확실한 것만 막는다. 애매하면 통과시킨다(사람을 지우는 쪽이 더 나쁘다).
// 헤드리스 브라우저도 막는다 — 우리 검증 스크립트가 집계를 오염시키지 않게 하려는 의도도 있다.
const BOT_UA =
  /(bot\b|bots\b|crawler|crawling|spider|scrapy|slurp|yeti|googlebot|bingbot|duckduckbot|baiduspider|yandex|ahrefs|semrush|mj12|dotbot|petalbot|bytespider|applebot|facebookexternalhit|whatsapp|telegrambot|twitterbot|discordbot|slackbot|linkedinbot|embedly|pinterest|redditbot|kakaotalk-scrap|daumoa|python-requests|curl\/|wget\/|libwww|okhttp|go-http-client|java\/|axios\/|node-fetch|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|pingdom|uptimerobot|gtmetrix|monitoring|preview)/i;

/** UA 문자열이 봇으로 보이면 true. UA 가 비어 있어도 봇으로 본다(정상 브라우저는 항상 보낸다). */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.trim().length === 0) return true;
  return BOT_UA.test(ua);
}
