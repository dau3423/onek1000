# QA 리포트: 세차 묶음 (FR-1 세차 필터 · FR-2 세차 지수 파이프라인 · FR-3 홈 세차 카드)

- 일자: 2026-08-16
- 대상: 기획서(plan.md) FR-1~FR-3 수용 기준
- 검증 방식: 정적 검증(typecheck/lint/build) + Mock 모드 dev 서버 + Chrome 브라우저 시나리오 + API 직접 호출(curl) + 코드 검증
- 변경 범위: `git diff HEAD --stat` 14개 수정 + 신규(carwash-index/sync-weather 라우트, CarwashDayCard, lib/weather/kma.ts, 마이그레이션 0036/0037)

## 판정: 통과 ✅ (환경 제약으로 일부 AC는 API 응답+코드 검증으로 보강 — 실패 항목 없음)

정적 검증 무오류. 브라우저로 실행한 모든 AC 시나리오가 성공했고, 실패한 AC는 없다.
단, 이 환경의 두 가지 제약(아래) 때문에 지도 마커/목록 기반 시나리오와 다크모드는 라이브 캡처 대신 API 응답과 코드로 실증했다. 이는 기능 결함이 아니라 환경 한계이며, 대응 근거를 각 AC에 명시한다.

**환경 제약(기능 결함 아님)**
1. `NEXT_PUBLIC_KAKAO_MAP_KEY` 미설정 → 지도가 렌더되지 않음("지도를 불러오지 못했습니다"). 지도는 bbox 조회를 트리거해 마커·하단 시트 목록을 채우므로, 지도 없이 세차 목록 행/배지(FR-1 AC-2)와 브랜드 AND 교집합(AC-3)의 라이브 화면을 볼 수 없다 → API(`/api/stations/bbox?carwash=1`) 응답 + 배지 렌더 코드로 실증.
2. FR-1의 목데이터 폴백은 `NEXT_PUBLIC_USE_MOCK`이 아니라 `isSupabaseConfigured()`(env 존재 여부)로 분기한다. `.env.local`에 실 Supabase 자격증명이 있어 `USE_MOCK=true`만으로는 세차 필터가 mock으로 동작하지 않았다(실 DB 히트, 0036 미적용이라 폴백). 이에 QA는 dev 서버를 Supabase env를 비운 채(`NEXT_PUBLIC_SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY=`) 재기동해 mock 경로를 강제 실증했다. (원본 `.env.local`은 수정하지 않음 — 셸 env 오버라이드만 사용.)

---

## 정적 검증

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (tsc --noEmit) | ✅ 무오류 |
| `npm run lint` (next lint) | ✅ No ESLint warnings or errors |
| `npm run build` (next build) | ✅ 성공(`/api/carwash-index`, `/api/internal/sync-weather` 포함 전 라우트 빌드) |

---

## 시나리오 결과

### FR-1: 지도 세차 필터 칩 + 배지

| AC | 절차 → 기대 → 실제 | 판정 |
|---|---|---|
| 1 | gas 레이어 FilterBar에 "세차" 칩 노출 / EV 레이어 미노출 / 탭 시 활성(주황) + 재탭 해제 → gas에서 💧세차 칩 보임, EV 칩 클릭 시 세차·브랜드 모두 사라짐, CTA로 켜니 주황 활성, "세차 필터 끄기"로 해제됨 | ✅ 라이브 |
| 2 | 칩 ON 시 세차 가능 주유소만 + 각 행 세차 배지 → 지도 미로드로 목록 라이브 캡처 불가. `GET /api/stations/bbox?...&carwash=1`(강제 mock)이 정확히 6곳(모두 `hasCarwash:true`) 반환, 미필터는 23곳 중 6곳 carwash. 배지는 `s.hasCarwash`에 조건부 렌더(BottomSheet.tsx:273) + 상세 세차장 배지와 동일 emerald 톤 | ✅ API+코드 실증 |
| 3 | 세차 + 브랜드 AND 교집합 → 지도/회원 필요로 라이브 불가. `queryStationsByBbox`가 brand·carwash를 함께 RPC/mock 이중 필터에 전달(queries.ts:74, 87). 코드 검증 | ✅ 코드 검증 |
| 4 | 칩 ON·결과 0곳 → 빈 상태 안내 + "세차 필터 끄기" 버튼, 오류 없음 → 하단 시트에 💧 + "이 지역엔 세차 가능으로 확인된 주유소가 아직 없어요 — 정보 수집 중" + "세차 필터 끄기" 버튼 표시. 클릭 시 일반 상태로 복귀 | ✅ 라이브 |
| 5 | 상세: `amenitiesUpdatedAt` null → "부가서비스 정보 확인 중입니다" / non-null·미보유 → "제공되는 부가서비스가 없습니다." → mock 상세는 항상 non-null이라 null 분기 라이브 불가(코드 diff로 문구 교체 확인). 양성 분기: /station/A0010001 상세에서 "세차장" emerald 배지 등 부가서비스 정상 노출 확인 | ✅ 양성 라이브 + null 분기 코드 검증 |
| 6 | 칩 OFF→ON 시 `carwash_filter_on` 1회 전송 → OFF→ON 클릭 시 `POST /api/event` 1건(200). ON→OFF 재탭 시 추가 이벤트 없음("1회" 충족) | ✅ 라이브 |

### FR-2: 세차 지수 데이터 파이프라인

| AC | 절차 → 기대 → 실제 | 판정 |
|---|---|---|
| 1 | `POST /api/internal/sync-weather` 시크릿 없이 호출 → 401 / 멱등 upsert → 시크릿 없음 시 `HTTP 401 {"error":"unauthorized"}`. 멱등 적재는 mock/키 없음이라 skip(로컬 실행 불가) → `onConflict:'date,region'` upsert 코드 검증 | ✅ 401 라이브 + 멱등 코드 검증 |
| 2 | `GET /api/carwash-index?lat=37.56&lng=126.97` → 서울 4일치(score 0~100, grade) + best, 1초 내 → `region:"01"`, `regionName:"서울"`, days 4개 + best 반환. 응답 ~0.8s(콜드 컴파일 포함, 재호출 즉시). 오류 없음 | ✅ 라이브 |
| 3 | Mock 모드에서 키 없이 mock 지수 반환 + 홈 카드 렌더 → 홈 gas 레이어에서 CarwashDayCard 정상 렌더(아래 FR-3 참조) | ✅ 라이브 |
| 4 | 미세먼지 API만 실패해도 POP 기반 지수 정상(dustGrade null) → `fetchDustGrades` 실패 시 빈 맵 반환, `computeDay`가 dust null 허용(kma.ts:247,101). 코드 검증 | ✅ 코드 검증 |
| 5 | `KMA_API_KEY` 클라이언트 번들 미노출 → `.next/static`에서 `KMA_API_KEY`/`AIRKOREA_API_KEY` grep 0건. CarwashDayCard는 `import type`(컴파일 시 소거)로만 kma 참조 | ✅ 번들 검증 |

부가 확인: `?lat=35.18&lng=129.07` → `region:"10" 부산` — 최근접 시도 판정(nearestSido) 정상.

### FR-3: 홈 "세차하기 좋은 날" 카드 + 딥링크

| AC | 절차 → 기대 → 실제 | 판정 |
|---|---|---|
| 1 | gas 홈에 카드 렌더(요일+등급+근거) / EV 미표시 → "이번 주 세차하기 좋은 날: 수요일" + [좋음] 배지 + "수요일 강수확률 10%" + 4일 스트립(오늘 나쁨40%·내일 나쁨80%·화 좋음20%·수 좋음10%, best 셀 물방울+ring 강조) + "서울 기준" 라벨. EV 레이어에선 카드 미렌더(스크롤 시 지도→푸터 직행) | ✅ 라이브 |
| 2 | CTA 탭 → 1초 내 세차 칩 활성 + 하단 시트 세차 목록 + `carwash_card_click` → CTA 클릭 시 하단 시트 타이틀 "이 지역 세차 가능 최저가 TOP N"으로 전환·시트 열림(접기▾), FilterBar 세차 칩 주황 활성, `POST /api/event` 1건(200) | ✅ 라이브 (목록 0건은 지도 미로드 탓) |
| 3 | 지수 없으면 카드 미렌더·콘솔 오류 없음 → mock이 항상 데이터 반환이라 빈 케이스 라이브 강제 불가. `days.length===0 || !best`면 return null(코드). 세차 관련 콘솔 오류 0건 | ✅ 코드 검증 + 콘솔 무오류 |
| 4 | "오늘 하루 숨김" → 당일 재방문 미표시, 익일 재노출 → 클릭 시 카드 즉시 언마운트, 새로고침 후에도 미표시(localStorage 지속). 익일(KST) 재노출은 `kstToday()` 비교 코드 검증 | ✅ 라이브(당일 지속) + 익일 코드 검증 |
| 5 | 면책·출처 문구 + 단정 표현 없음 → "예보 기반 참고용 지수입니다 · 출처: 기상청" 표시(dustGrade null이라 에어코리아 미표기 정상). 근거·스트립 모두 "강수확률 N%"·등급 라벨만, "비 온다" 류 단정 없음 | ✅ 라이브 |
| 6 | 모바일·다크모드에서 기존 배너와 겹침 없음 → 카드는 문서 흐름(지도 하단, ForecastCard 위)이라 RadiusAlert/BottomSheet/배너와 구조적으로 비겹침 확인. 다크모드: 앱이 Tailwind `media` 전략(OS 설정) + 인앱 토글 없음, 실행 환경이 라이트라 라이브 다크 캡처 불가 → 전 컴포넌트 `dark:` 변형 코드 검증(기존 EvRow/AmenityList 검증 팔레트 재사용). 모바일: 창 리사이즈가 캡처 뷰포트에 반영되지 않아 390px 리플로 미확정 → `grid grid-cols-4`+상대단위 반응형 코드 검증 | ⚠️ 겹침 없음 라이브 + 다크/모바일 코드 검증(라이브 미확정) |

---

## 콘솔 에러

- 세차 기능 관련 콘솔 에러: **0건**.
- 관측된 에러 4건은 전부 상세 페이지의 recharts `defaultProps` deprecation 경고(XAxis/YAxis, 3rd-party 라이브러리) — 이번 변경 범위 밖, 기존 이슈. (아래 리스크 기록)

## 모바일·다크모드 확인 결과

- 다크모드: 앱은 `next-themes`/토글 없이 Tailwind 기본 `media` 전략을 쓴다. 실행 환경 OS가 라이트여서 라이브 다크 렌더를 강제할 수 없었다. CarwashDayCard·BottomSheet(빈 상태·배지)·상세 안내 박스 모두 `dark:` 변형이 빠짐없이 부여되어 있고, 등급/배지 팔레트는 이미 프로덕션에서 검증된 EvRow(급속)·AmenityList의 emerald/amber/rose 다크 쌍을 그대로 사용한다.
- 모바일: 창을 390×844로 리사이즈했으나 캡처 뷰포트가 데스크톱 폭을 유지해 실제 리플로를 확정 캡처하지 못했다. 카드 스트립은 `grid grid-cols-4`+상대단위+`mx-3`로 반응형이며, 2자 등급 라벨("좋음/나쁨")은 셀 폭에 여유가 있다(디자인 명세는 ≤340px 리스크만 별도 표기).

---

## 발견 문제 상세

- 기능 AC 실패 항목 **없음**. 재현해야 할 결함 없음.

## 미해결/리스크

1. **[QA 환경/개발 편의] FR-1 목 폴백 스위치 불일치**: 지도 조회(`queryStationsByBbox`/`queryStationsByRadius`)의 mock 폴백은 `NEXT_PUBLIC_USE_MOCK`이 아니라 `isSupabaseConfigured()`로 분기한다. 실 Supabase env가 있으면 `USE_MOCK=true`여도 실 DB로 붙어, 0036 미적용 로컬에선 세차 필터·배지가 (설계된 graceful 폴백으로) 조용히 비활성된다. 기존 코드베이스 관례(모든 station 쿼리가 동일)와 일치하므로 결함은 아니나, "Mock 모드로 세차 필터를 확인"하려면 Supabase env를 비워야 함을 팀이 인지할 것. (개선안: station 쿼리도 `USE_MOCK` 우선 분기 검토 — 범위 밖.)
2. **지도 마커/목록 라이브 미검증(환경)**: 이 환경에 `NEXT_PUBLIC_KAKAO_MAP_KEY`가 없어 지도가 안 뜨고, 세차 목록 행/배지(FR-1 AC-2)·브랜드 AND 교집합(AC-3)의 실제 화면을 못 봤다. API 응답(정확히 6곳 필터)과 배지 렌더 코드로 실증했으나, 카카오 키가 있는 환경에서 목록 배지 육안 확인 1회를 권장.
3. **다크모드 라이브 미검증(환경)**: `media` 전략 + OS 라이트라 강제 불가. 코드상 다크 변형은 완비. 다크 OS 환경에서 카드/빈 상태 1회 확인 권장.
4. **null amenities·빈 지수·모든 날 bad 분기**: mock이 항상 유효 데이터(amenitiesUpdatedAt=today, 지수 4일치, best=good)를 반환해 "부가서비스 확인 중"(FR-1 AC-5 null), 빈 지수 카드 미렌더(FR-3 AC-3), 전부 bad 카드(흐름 C)를 라이브로 유발하지 못했다. 각각 코드 검증 완료(문구 교체 diff, `return null` 가드, `allBad` 분기).
5. **[범위 밖·기존] 상세 페이지 recharts 경고**: `defaultProps will be removed` 경고 4건(recharts XAxis/YAxis). 세차와 무관한 기존 3rd-party 경고 — 별도 처리 대상.
6. **[운영] 마이그레이션 0036/0037 로컬/운영 미적용**: 0037 파일 주석대로 운영자가 수동 적용 예정. 미적용 시 조회 API는 mock/`days:[]` 폴백, sync-weather는 부분 오류 보고로 앱을 깨지 않음(설계대로). 운영 배포 시 0036(RPC drop→create 순단 주의)·0037 적용과 KMA/에어코리아 키 세팅이 실데이터 동작의 전제.

## 정리(cleanup)

- QA가 띄운 dev 서버(포트 3000)만 종료, 열었던 탭만 닫음. 사용자의 다른 프로세스·`.env.local` 원본 미변경(셸 env 오버라이드만 사용).
