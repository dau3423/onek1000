# QA 리포트: 유종 전면 반영 — 검색·상세·셀프 필터 일관성

- 작성일: 2026-08-15 (qa-tester)
- 대상: plan.md FR-1/FR-2/FR-3, design.md S1~S15
- 변경 파일: `app/api/search/route.ts`, `app/search/page.tsx`, `app/station/[id]/page.tsx`, `components/station/FuelLogButton.tsx`, `components/ui/FilterBar.tsx`, `app/page.tsx`, `stores/map.ts` (수정) / `components/station/FuelSelectionProvider.tsx`, `components/station/PriceTrendSection.tsx`, `components/station/FuelLogSelectedButton.tsx` (신규)

## 판정: 조건부 통과

정적 검증(typecheck/lint/build) 무오류. 이 환경에서 **재현 가능한 모든 AC 시나리오가 성공**했고, **실패한 AC는 없다**. 다만 환경 제약(아래 명시)으로 일부 AC를 브라우저에서 검증하지 못해 조건부 통과로 판정한다.

- **미검증 사유는 전부 환경/데이터 한계이며 구현 결함이 아니다:**
  1. `NEXT_PUBLIC_KAKAO_MAP_KEY` 미설정 → 홈 지도가 렌더되지 않아(“지도를 불러오지 못했습니다”) **FR-3의 마커/시트 필터 결과(AC-2·3·6)를 시각 검증 불가**. bbox 데이터도 로드되지 않아 하단 시트도 빈 상태.
  2. Mock 시드는 **모든 주유소가 전 유종(휘발유·고급·경유·실내등유·LPG) 가격을 non-null로 보유** → “가격 정보 없음”·“LPG 전용 충전소 누락 버그”·“store 유종 부재 시 폴백” 경로를 mock에서 재현 불가(**plan이 이미 명시한 한계 — 실 DB 표본 검증 필요**).
  3. Tailwind `darkMode`가 `media`(기본값)이고 인앱 테마 토글이 없어, 브라우저 도구로 `prefers-color-scheme: dark`를 강제할 수 없어 **다크모드 런타임 확인 불가**(코드 검증으로 대체).

## 정적 검증

| 단계 | 결과 |
|---|---|
| `npm run typecheck` (tsc --noEmit) | ✅ 무오류 |
| `npm run lint` (next lint) | ✅ “No ESLint warnings or errors” |
| `npm run build` | ✅ 성공(전 라우트 컴파일, `/search` 4.52kB, `/station/[id]` 9kB) |

## 브라우저 검증 환경

- 기동: `NEXT_PUBLIC_USE_MOCK=true NEXT_PUBLIC_SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= PORT=3000 npm run dev`
- **중요**: 데이터 레이어(`/api/search`, `lib/db/queries.ts`, 상세 조회)는 `NEXT_PUBLIC_USE_MOCK`가 아니라 **`isSupabaseConfigured()`로 mock/실DB를 분기**한다. `.env.local`에 실 Supabase 키가 있어 `USE_MOCK=true`만으로는 mock이 되지 않으므로, 결정적 mock 동작을 위해 Supabase 키를 빈 값으로 오버라이드해 기동했다(사실대로 기록).
- Chrome 확장으로 API 직접 호출 + 검색/상세/필터바 화면 시나리오 수행. 서버·탭은 QA 종료 시 정리 완료(포트 3000 free 확인).

## 시나리오 결과

### FR-1 검색 유종 반영

| AC | 절차 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| 1 | 홈에서 경유(D047) 선택 → 헤더 🔍(클라이언트 nav) → “GS” 입력 | 각 행 경유가 + “경유” 라벨 + “가격은 경유 기준” 캡션 | 캡션 “가격은 경유 기준”, GS 강남대로셀프 경유 ₩1,452(=시드 D047), GS 압구정 ₩1,628. 우측 “경유” 라벨. 값은 `getMockStations(D047)`로 홈 마커와 동일 출처 | ✅ |
| 2 | LPG 모드로 LPG 전용 충전소 검색(0→1건) | 충전소 노출 + LPG가 | Mock에 LPG 전용(휘발유 null) 시드 없음 → **재현 불가**. left join 코드 경로는 리뷰 확인 | ⚠️ 미검증(실DB 필요) |
| 3 | 휘발유 모드로 같은 충전소 → “가격 정보 없음” | 행 노출 + “가격 정보 없음” | Mock 전 유종 non-null → **재현 불가**. `r.price != null` 분기 코드 확인 | ⚠️ 미검증(실DB 필요) |
| 4 | is_self=true 행에 “셀프” 배지 | 에메랄드 배지 | 강남대로셀프·합정·미아·판교셀프·안양·부평셀프·해운대·동대구·둔산·상무 등에 에메랄드 “셀프” 배지, 비셀프(압구정·문정·광화문·제주시)엔 없음 | ✅ |
| 5 | `GET /api/search?q=..&product=D047` result에 product·price / `product=XXXX`→400 | product 담김, 비유효 400 | `curl` 확인: D047 result 전건 `"product":"D047"`+경유 price(1452), 기본 무지정→B027(1592), 고급 B034(1842), LPG C004(1102), **`product=XXXX`→HTTP 400** | ✅ |
| 6 | Mock 모드 무키 동작 | 1·4·5 동일 | 위 전부 mock(무 Supabase 키)에서 확인 | ✅ |

### FR-2 상세 가격추이 유종 탭

| AC | 절차 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| 1 | 홈 경유 선택 → 검색 결과행(클라이언트 nav)으로 상세 진입 | 제목 “경유 30일 추이”, 경유 탭 활성, 경유 차트 | 제목 “경유 30일 추이”, 경유 탭 주황 활성, 차트 경유 데이터(y축 1,553~1,650) | ✅ |
| 2 | 가격 있는 유종만 탭 노출 | non-null 유종만 | Mock 전 유종 non-null → 탭 5개(휘발유·고급·경유·실내등유·LPG) 모두 노출. `available = PRODUCT_ORDER.filter(prices[p]!=null)` 로직 정상. “숨김” 케이스는 mock서 재현 불가 | ⚠️ 부분(로직 정상, 숨김 미재현) |
| 3 | 탭 전환(경유→휘발유) | 차트 갱신 + 제목 라벨 동기 | 휘발유 클릭 시 제목 “휘발유 30일 추이”, 탭 활성 이동, 차트 재조회(y축 1,548~1,652로 변동) | ✅ |
| 4 | 홈 유종을 취급 안 하는 곳 진입 → 첫 non-null 유종 폴백 | 빈 차트 대신 폴백 | Mock 전 주유소가 전 유종 보유 → 폴백 분기(`available.includes(store)?...:available[0]`) **재현 불가**. 코드 확인 | ⚠️ 미검증(실DB 필요) |
| 5 | 경유 탭에서 “여기서 주유” → 리터 30 | 추정 = 경유 단가 × 30 | 캡션 “약 ₩43,560 (경유 단가 ₩1,452/L 기준)” = 30×1452. 휘발유 아님 | ✅ |
| 6 | Mock 무키 탭 전환·차트 | 1~5 동작 | 확인 | ✅ |
| 순서 | 섹션 시각 순서 불변(추이→…→CTA) | 유종별가격→(내기록)→추이→리뷰→부가서비스→CTA | 육안 확인, `FuelSelectionProvider`가 Context로 서버 섹션을 children 감싸 DOM 순서 보존. 콘솔에 순서 관련 이상 없음 | ✅ |

### FR-3 셀프 필터 칩

| AC | 절차 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| 1 | gas 레이어 필터바 “셀프” 칩 탭/재탭 | 칩 노출, 활성 스타일, 재탭 해제 | 칩 노출(EV 뒤). 탭→주황 활성(휘발유/경유와 2개 공존 정상), 재탭→회색 해제. `aria-pressed={selfOnly}` 바인딩(코드) | ✅ |
| 2 | 셀프 활성 시 마커/회색점/시트가 셀프만 | 비셀프 사라짐 | **미검증** — Kakao 키 없어 지도 미렌더, bbox 데이터 없어 시트도 빈 상태. `visible*` useMemo에 `!selfOnly||s.isSelf` 결합은 코드 확인 | ⚠️ 미검증(지도 미가용) |
| 3 | 브랜드+셀프 AND | 교집합만 | 위와 동일 사유 미검증. `filterDisplay`가 `matchBrand && (!selfOnly||isSelf)` AND 결합(코드 확인) | ⚠️ 미검증(지도 미가용) |
| 4 | 셀프 활성 상태 유종 전환/패닝 유지 | 유지 | 휘발유→경유 전환 후에도 셀프 칩 활성 유지 확인(패닝은 지도 미가용) | ✅(전환), ⚠️(패닝 미검증) |
| 5 | EV 전환 시 칩 미노출, gas 복귀 시 상태 유지 | 숨김+복원 | 셀프 ON 상태에서 EV→칩 사라짐, gas 복귀 시 셀프 칩 재등장 **AND 활성 유지** | ✅ |
| 6 | 전국 TOP10 크라운 핀은 셀프 중에도 표시(예외) | 표시 유지 | `visibleNationalTop10`은 selfOnly 미적용(브랜드만) — 코드 확인. 지도 미가용으로 시각 미검증 | ⚠️ 코드 확인(시각 미검증) |

## 콘솔 에러

- 상세 페이지에서 recharts `XAxis`/`YAxis`의 `Support for defaultProps will be removed…` 경고 2건. **차트 라이브러리(recharts)의 React 18 deprecation 경고이며, 이번에 손대지 않은 `PriceHistoryChart` 재사용에서 발생 → 이번 변경과 무관·기능 영향 없음(기존 이슈)**. 그 외 앱 코드 유래 에러 없음.

## 모바일·다크모드 확인

- **모바일**: 앱은 `max-w-md` 단일 컬럼(모바일 퍼스트)이라 데스크톱에서도 448px 중앙 컬럼 = 모바일 레이아웃과 동일하게 렌더. 상세 섹션 순서 보존, CTA 하단 배치(`pb-[calc(16px+env(safe-area-inset-bottom))]` 유지) 확인. 창 리사이즈로 별도 좁은 뷰포트 강제는 스크린샷 도구 상 반영되지 않았으나, 제약 컬럼 레이아웃이 곧 모바일 레이아웃이라 회귀 없음으로 판단.
- **다크모드**: `tailwind.config.ts`에 `darkMode` 미지정 → 기본 `media` 전략. 인앱 토글 없고 브라우저 도구로 OS `prefers-color-scheme`를 강제할 수 없어 **런타임 확인 불가**. 코드 검증으로 대체: 신규 요소가 design 지침대로 시맨틱 클래스 + 원본 dark: 쌍을 복제함을 확인 — FilterBar/추이 탭(`dark:bg-gray-800 dark:text-gray-300 …`), 검색 셀프 배지(`dark:bg-emerald-950 dark:text-emerald-300`). 검색·상세 본문은 design상 의도적으로 라이트 전용(다크는 백로그).

## 발견 문제 상세

- **AC 실패 없음.** 이번 변경 범위에서 회귀·결함으로 확정된 항목 없음.

## 미해결/리스크

1. **[재검증 필요·실DB] FR-1 AC-2/3, FR-2 AC-4**: mock 시드가 전 유종 non-null이라 “LPG 전용 충전소 누락 복구(0→1건)”·“가격 정보 없음” 표기·“store 유종 부재 폴백”을 재현하지 못함. plan 성공지표(“실 DB 표본 3개 충전소 0→1건 복구”) 및 미해결-1(PostgREST left join+임베드 필터 실동작)은 **스테이징/실 Supabase에서 별도 확인이 필요**하다. 코드 경로(`prices_latest(product,price)` non-inner + `.eq('prices_latest.product',product)`, `price ?? null`)는 리뷰상 정합.
2. **[환경] FR-3 마커/시트 필터(AC-2·3·6)와 패닝 유지**: `NEXT_PUBLIC_KAKAO_MAP_KEY` 미설정으로 지도·bbox가 로드되지 않아 시각 검증 불가. 필터 로직(`app/page.tsx`의 `filterDisplay` = 브랜드 AND 셀프, `visibleNationalTop10`은 셀프 미적용) 및 TOP10 예외(S14)는 코드로 확인. **Kakao 키가 있는 환경에서 마커·시트가 셀프만 남는지, 크라운 핀이 유지되는지 재확인 권장**.
3. **[환경] 다크모드**: `darkMode: 'media'` + 인앱 토글 부재로 런타임 미검증(코드상 dark: 쌍 정합). OS 다크 환경/토글 도입 시 육안 재확인 권장.
4. **[범위 밖·기존] recharts defaultProps 경고**: 라이브러리 레벨 deprecation. 이번 사이클과 무관하나 향후 recharts 업그레이드 시 정리 대상(백로그 메모).
5. **[구조 관찰·범위 밖]** `/api/search` 등 데이터 레이어가 `NEXT_PUBLIC_USE_MOCK`이 아닌 `isSupabaseConfigured()`로 분기 → 실 키가 있으면 `USE_MOCK=true`만으로 mock이 되지 않는다. 이번 변경이 만든 문제는 아니나, QA/데모 재현성을 위해 mock 게이팅 일원화는 별도 개선 후보.
