# 개선 백로그

개선 사이클에서 발굴되었지만 아직 착수하지 않은 아이디어를 누적한다.
researcher 에이전트가 추가하고, pm 에이전트가 주제 자율 선정 시 참조한다.

- 상태: `후보`(미착수) / `진행중`(현재 사이클) / `완료`(사이클 폴더 링크) / `보류`(사유 기재)
- 새 항목은 표 맨 위에 추가한다.

| 추가일 | 아이디어 | 기대 가치 | 예상 비용 | 상태 | 근거/메모 |
|---|---|---|---|---|---|
| 2026-08-15 | 등유(K015) 마커/필터 정책 | 소 | 소~중 | 후보 | fuel-type-consistency Out 이관. sync-opinet이 K015 미적재(코드상). 등유 취급소만 마커 표시 등 별도 설계 + 데이터 적재 선결. 라벨은 오피넷 공식명 '실내등유' 유지, SRS '등유' 표기와 문서 통일 필요 |
| 2026-08-15 | 전국 TOP10 크라운 핀에 셀프 필터 적용 | 소 | 소~중 | 후보 | fuel-type-consistency Out 이관. `NationalTop10Item`(types/station.ts:134~142)에 `isSelf` 부재 → 타입·`queryNationalTop10` 확장 필요. 확장하면 셀프 필터가 크라운 핀까지 일관 적용 |
| 2026-08-15 | 이벤트 계측에 product(유종) 차원 추가 | 중 | 소 | 후보 | fuel-type-consistency Out 이관. `funnel_events`에 유종 차원 없어 우리 서비스 내 경유/LPG 선택 비율 미확인. 개인정보 영향 없음. 세그먼트 실측용 |
| 2026-08-15 | station 페이지 `generateMetadata`(주유소명 OG/SEO) | 중 | 소~중 | 후보 | fuel-type-consistency 조사 발견. station 상세에 generateMetadata 부재(regions 2곳만 존재). A4 공유 루프 사이클에 흡수 가능 |
| 2026-08-15 | 관리자 지역별 접속 집계 지도(시도 단계구분도) + IP→시도 GeoIP 파이프라인 | 중 | 중 | 완료 | [2026-08-15-admin-region-heatmap](2026-08-15-admin-region-heatmap/) — FR-1/2/3 전량 구현(0035 마이그레이션 파일 + lib/geoip graceful null + /admin 스키매틱 SVG 타일 지도). 리뷰 ✅, QA 조건부 통과(/admin 로그인 게이트로 시각화 육안 미검증→코드 갈음). **후속: 0035 프로덕션 적용 + MaxMind 키·mmdb 도입 + x-fah-client-ip 실측은 운영자 몫(docs/운영_GeoIP_도입절차.md)** |
| 2026-08-15 | 접속 지역 시군구 단위 집계(v2) | 중 | 중~대 | 후보 | admin-region-heatmap Out 이관. v1은 시도 17개만. 운영 데이터로 GeoIP 도시 정확도·수요 확인 후 `lib/sigungu-data.ts` 재사용 |
| 2026-08-15 | 지역 통계 신뢰도(미상 비율 카드 + 봇/데이터센터 IP 필터) | 소~중 | 중 | 후보 | admin-region-heatmap Out 이관. 모바일 통신사 IP 수도권 편중·봇 혼입 대응. GeoIP hosting/proxy 플래그 활용 |
| 2026-08-15 | A4 공유 루프(상세/TOP10 공유 버튼 + 주유소별 동적 OG) | 상 | 중 | 후보 | growth 사이클 Out 이관. 사용자 화면 변경 → ux-designer 필요. 계기판(계측) 구축 완료됐으므로 `share_click` 이벤트를 화이트리스트에 추가해 공유 효과 측정 가능. **유종 정합(2026-08-15) 완료 후 진행하면 공유 카드 가격이 정확해짐** |
| 2026-08-15 | B3 푸시 옵트인 관문 완화(비로그인 개방) | 중 | 중~대 | 후보 | growth 사이클 Out 이관. 구독 API·발송 대상 쿼리 구조 변경. BETA_FREE 종료 계획과 함께 설계 필요(research 미해결 5) |
| 2026-08-15 | B4 PWA 설치 배너 재노출 정책 | 중 | 소~중 | 후보 | growth 사이클 Out 이관. 이번 사이클 `pwa_install` 계측으로 설치·거절율 기초선 확보 후 정책 결정 |
| 2026-08-15 | A3 시군구 URL 슬러그화(301) | 중 | 대 | 후보 | growth 사이클 Out 이관. SEO 장기 효과·즉효성 낮음, 211페이지 리다이렉트 검증 비용 큼 |
| 2026-08-15 | A5 레퍼럴 보상 재설계 / B5 주유로또 / B6 가격 제보 / B7 할인카드 실질가 | 중~상 | 대 | 후보 | growth 사이클 Out 이관. 보상 설계·경품 규정·데이터 소스 등 선결 조건 미해결 |
| 2026-08-15 | weekly-digest 멱등키(재실행 중복 발송 방지) | 중 | 소~중 | 후보 | growth 사이클 FR-3 파생. 크론 실가동 결정 후 함께 처리 |
| 2026-08-14 | 성장 계기판(핵심행동 계측 6종 + D1/D7 코호트 + 유입 채널) + 크론 보안 보강 | 상 | 중 | 완료 | [2026-08-14-growth-acquisition-retention](2026-08-14-growth-acquisition-retention/) — FR-1/2/3 전량 구현. 리뷰 ✅, QA 통과(보안 가드 403 실증, 일부 브라우저 확증은 환경 제약으로 코드 갈음). **후속: 마이그레이션 0034 프로덕션 적용 + 크론 등록 + X env 주입은 운영자 몫** |
| 2026-08-14 | 1km 알람 임계값 설정(마이페이지) | 중 | 중 | 후보 | SRS FR-2.3 미완, `app/page.tsx:45` 하드코딩. 니즈 규모 미검증 |
| 2026-08-14 | 셀프/등유 필터 칩 추가 | 중 | 소~중 | 완료 | [2026-08-15-fuel-type-consistency](2026-08-15-fuel-type-consistency/) FR-3에 흡수(셀프 칩). 등유(K015) 칩은 Out으로 분리(위 '등유 마커/필터 정책' 행). `is_self`는 이미 API 응답에 존재 |
| 2026-08-14 | 상세 페이지 가격추이 유종 탭 | 중 | 중 | 완료 | [2026-08-15-fuel-type-consistency](2026-08-15-fuel-type-consistency/) FR-2에 흡수. `app/station/[id]/page.tsx:111` B027 고정. PriceHistoryChart가 product prop 이미 지원. 주유기록 단가 B027 고정(:134)도 함께 수정 |
| 2026-08-14 | 검색 결과 유종 반영 | 중 | 중 | 완료 | [2026-08-15-fuel-type-consistency](2026-08-15-fuel-type-consistency/) FR-1에 흡수. `app/api/search/route.ts:34~36` B027 하드코딩 + inner join으로 LPG 전용 충전소 검색 누락 버그 동반 수정 |
| 2026-08-14 | 다크모드 미적용 페이지 정합 | 중 | 대 | 후보 | 상세/검색/마이/pricing에 `dark:` 부재, NFR-8 위반. 페이지 단위 분할 필요(1사이클 초과 실측). **주의: 아이콘 사이클(2026-08-14)에서 이 페이지들 아이콘에 라이트 전용 색(text-gray-*, text-green-600 등)을 넣었으므로, 다크 도입 시 해당 아이콘 색도 함께 `dark:` 보정 필요(design.md 미해결 8). fuel-type-consistency(2026-08-15)에서 새로 추가한 검색/상세 요소는 시맨틱 클래스·기존 톤 유지 원칙 적용됨** |
| 2026-08-14 | 이모지 아이콘 → 공용 SVG 전면 교체 + 뒤로가기/닫기/즐겨찾기 UX | 상 | 중~대 | 완료 | [2026-08-14-ux-polish-emoji-to-icons](2026-08-14-ux-polish-emoji-to-icons/) — FR-1/FR-2 전량 구현(G1~G4), 이월 없음. 리뷰 ✅, QA 조건부 통과(브라우저 자동화 미수행) |
| 2026-08-14 | 방향 배지 글리프(▲▼─·↑) SVG화 | 소 | 소 | 후보 | ForecastCard/ForecastMiniCard `meta.arrow`, PriceTrendBanner "+N% ↑" 등. AC-1-1 grep 범위 밖이라 이번 교체 대상 아니었음. 일관성 차원 후속 정리 후보 |
| 2026-08-14 | 기존 인라인 SVG의 공용 아이콘 세트 치환 | 소 | 소 | 후보 | FilterBar 셰브런/체크, page.tsx ⓘ 범례, NoticePopup, InstallBanner 등 기존 인라인 SVG를 `components/icons/`로 점진 수렴(중복 제거). 동작 영향 없는 리팩터 |
