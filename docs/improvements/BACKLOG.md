# 개선 백로그

개선 사이클에서 발굴되었지만 아직 착수하지 않은 아이디어를 누적한다.
researcher 에이전트가 추가하고, pm 에이전트가 주제 자율 선정 시 참조한다.

- 상태: `후보`(미착수) / `진행중`(현재 사이클) / `완료`(사이클 폴더 링크) / `보류`(사유 기재)
- 새 항목은 표 맨 위에 추가한다.

| 추가일 | 아이디어 | 기대 가치 | 예상 비용 | 상태 | 근거/메모 |
|---|---|---|---|---|---|
| 2026-08-16 | 독립 셀프·손세차장 지도 레이어(carwash_places + sync + bbox API + 레이어 UI + 유형 필터) | 중~상 | 중 | 완료 | [2026-08-16-carwash-layer](2026-08-16-carwash-layer/) EV 파이프라인 복제. FR-1~3 전량 구현(리뷰 ✅ Critical/Major 0, QA 조건부 통과 — 정적·API 레벨 AC 성공, 브라우저 UI는 카카오키·네트워크 제약으로 코드/API 갈음). 기존 부설 '세차'→'세차 가능' 개명, 신규 '세차장' 레이어 칩 분리. **후속(운영자): 마이그레이션 0038 수동 적용 · POST /api/internal/sync-carwash 1회 적재 · sync-carwash 크론 주 1회 등록** |
| 2026-08-16 | 세차장 v2 — 부설 중복 병합 + 크라우드소싱 유형/폐업 제보 | 중 | 중~대 | 후보 | carwash-layer Out 이관. 적재 후 unknown 비율·좌표 품질 실측 근거로 상호·좌표 근접(≈50m) 병합 + 제보 UI(모더레이션·rate-limit). research §5 2안·§6-6 |
| 2026-08-16 | EV 충전소 길안내 확인 모달 문구 정리(NaviConfirm kind='ev') | 소 | 소 | 후보 | carwash-layer 리뷰서 발견. EV도 naviTarget에 price:0 채워 '주유소·₩0' 잠재 오표기. 세차장에 추가한 kind 옵션에 'ev' 분기만 더하면 정리 가능 |
| 2026-08-16 | 세차 묶음(세차 필터 칩 + "세차하기 좋은 날" 지수 + 홈 카드) | 중~상 | 하~중 | 완료 | [2026-08-16-new-feature-discovery](2026-08-16-new-feature-discovery/) 후보 C2 채택. FR-1~3 전량 구현(리뷰 ✅ Critical/High 0, QA 통과 — Mock 브라우저 시나리오 전 AC 성공, 지도 배지·다크모드는 카카오키·OS 제약으로 코드/API 갈음). **후속(운영자): 마이그레이션 0036/0037 수동 적용 · 기상청/에어코리아 활용신청+KMA_API_KEY/AIRKOREA_API_KEY 시크릿 등록 · sync-weather 크론 1일 1회 등록** |
| 2026-08-16 | C1 개인화 주유 타이밍 알림(다음 주유일 예측 + 예측방향 결합 푸시) | 상 | 중 | 후보 | new-feature-discovery research §4 C1(researcher 1순위 추천, PM은 도달규모 리스크로 C2 우선). 예측모델(0026)+fuel_logs(0012) 결합, 경쟁 4사 전무. **선결: 주유기록 3회↑ 사용자 규모 실측**. 채택률 오르면 후속 사이클 유력 |
| 2026-08-16 | C3 주유 할인카드 실질가(내 카드 반영 체감가) | 상 | 대 | 후보 | new-feature-discovery research §4 C3(기존 B7 구체화). 카드 혜택 DB 수동 큐레이션+관리자 CRUD(notices CMS 패턴). **항구 유지비·오표기 클레임 리스크**가 비용의 전부. 지도 실질가 정렬로 차별화 |
| 2026-08-16 | C4 여행(경로) 기름값 계산기(GasBuddy trip cost) | 중 | 하~중 | 후보 | new-feature-discovery research §4 C4. 경로거리 × 내 연비(avgKmPerL) × 평균가. 기존 경로 화면에 카드 추가. 명절·휴가철 스파이크·공유 소재("서울 부산 기름값") 롱테일 SEO 가설 |
| 2026-08-16 | C5 자주 가는 경로 저장 + 경로 최저가 변동 알림 | 중 | 중 | 후보 | new-feature-discovery research §4 C5. 0015 RPC + interest_regions 알림 패턴 재사용. **LBS 사업내용설명서·개인정보처리방침 갱신 선결**(출발·도착=집·회사 추정 좌표쌍 저장은 관심지역보다 민감) |
| 2026-08-16 | C6 "가격 다름" 경량 신고(크라우드소싱 신뢰 배지) | 중 | 중 | 후보 | new-feature-discovery research §4 C6(기존 B6 축소판). 오피넷 표시가≠현장가 불만 실증. 덮어쓰기 아닌 "확인 필요" 배지형. **DAU 150 저밀도에서 배지 발동 빈도 낮을 수 있음** — 계측 후 확대 판단 |
| 2026-08-16 | C7 차량 소모품 교체 알림(차계부 확장) | 중 | 중 | 후보 | new-feature-discovery research §4 C7. vehicles(0006)+fuel_logs.odometer(0012) 재사용. 오일나우 정비기록 대응이나 유가 코어와 거리 있어 우선순위 낮음. odometer 입력률 낮으면 날짜 기반 폴백 |
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
| 2026-08-15 | A5 레퍼럴 보상 재설계 / B5 주유로또 / B6 가격 제보 / B7 할인카드 실질가 | 중~상 | 대 | 후보 | growth 사이클 Out 이관. 보상 설계·경품 규정·데이터 소스 등 선결 조건 미해결. **B6→C6, B7→C3으로 2026-08-16 구체화(위 행 참조)** |
| 2026-08-15 | weekly-digest 멱등키(재실행 중복 발송 방지) | 중 | 소~중 | 후보 | growth 사이클 FR-3 파생. 크론 실가동 결정 후 함께 처리 |
| 2026-08-14 | 성장 계기판(핵심행동 계측 6종 + D1/D7 코호트 + 유입 채널) + 크론 보안 보강 | 상 | 중 | 완료 | [2026-08-14-growth-acquisition-retention](2026-08-14-growth-acquisition-retention/) — FR-1/2/3 전량 구현. 리뷰 ✅, QA 통과(보안 가드 403 실증, 일부 브라우저 확증은 환경 제약으로 코드 갈음). **후속: 마이그레이션 0034 프로덕션 적용 + 크론 등록 + X env 주입은 운영자 몫** |
| 2026-08-14 | 1km 알람 임계값 설정(마이페이지) | 중 | 중 | 후보 | SRS FR-2.3 미완, `app/page.tsx:45` 하드코딩. 니즈 규모 미검증 |
| 2026-08-14 | 셀프/등유 필터 칩 추가 | 중 | 소~중 | 완료 | [2026-08-15-fuel-type-consistency](2026-08-15-fuel-type-consistency/) FR-3에 흡수(셀프 칩). 등유(K015) 칩은 Out으로 분리(위 '등유 마커/필터 정책' 행). `is_self`는 이미 API 응답에 존재. **주의: 2026-08-16 세차 사이클 기획 중 현 작업 트리에 셀프 칩 코드 부재 확인(리버트 추정) — 실행 시 git log로 사유 확인 필요** |
| 2026-08-14 | 상세 페이지 가격추이 유종 탭 | 중 | 중 | 완료 | [2026-08-15-fuel-type-consistency](2026-08-15-fuel-type-consistency/) FR-2에 흡수. `app/station/[id]/page.tsx:111` B027 고정. PriceHistoryChart가 product prop 이미 지원. 주유기록 단가 B027 고정(:134)도 함께 수정 |
| 2026-08-14 | 검색 결과 유종 반영 | 중 | 중 | 완료 | [2026-08-15-fuel-type-consistency](2026-08-15-fuel-type-consistency/) FR-1에 흡수. `app/api/search/route.ts:34~36` B027 하드코딩 + inner join으로 LPG 전용 충전소 검색 누락 버그 동반 수정 |
| 2026-08-14 | 다크모드 미적용 페이지 정합 | 중 | 대 | 후보 | 상세/검색/마이/pricing에 `dark:` 부재, NFR-8 위반. 페이지 단위 분할 필요(1사이클 초과 실측). **주의: 아이콘 사이클(2026-08-14)에서 이 페이지들 아이콘에 라이트 전용 색(text-gray-*, text-green-600 등)을 넣었으므로, 다크 도입 시 해당 아이콘 색도 함께 `dark:` 보정 필요(design.md 미해결 8). fuel-type-consistency(2026-08-15)에서 새로 추가한 검색/상세 요소는 시맨틱 클래스·기존 톤 유지 원칙 적용됨** |
| 2026-08-14 | 이모지 아이콘 → 공용 SVG 전면 교체 + 뒤로가기/닫기/즐겨찾기 UX | 상 | 중~대 | 완료 | [2026-08-14-ux-polish-emoji-to-icons](2026-08-14-ux-polish-emoji-to-icons/) — FR-1/FR-2 전량 구현(G1~G4), 이월 없음. 리뷰 ✅, QA 조건부 통과(브라우저 자동화 미수행) |
| 2026-08-14 | 방향 배지 글리프(▲▼─·↑) SVG화 | 소 | 소 | 후보 | ForecastCard/ForecastMiniCard `meta.arrow`, PriceTrendBanner "+N% ↑" 등. AC-1-1 grep 범위 밖이라 이번 교체 대상 아니었음. 일관성 차원 후속 정리 후보 |
| 2026-08-14 | 기존 인라인 SVG의 공용 아이콘 세트 치환 | 소 | 소 | 후보 | FilterBar 셰브런/체크, page.tsx ⓘ 범례, NoticePopup, InstallBanner 등 기존 인라인 SVG를 `components/icons/`로 점진 수렴(중복 제거). 동작 영향 없는 리팩터 |
