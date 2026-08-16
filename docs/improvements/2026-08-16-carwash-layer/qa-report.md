# QA 리포트: 독립 셀프·손세차장 지도 레이어

> QA 수행: 2026-08-16 · 대상 변경: 미커밋(신규 8파일 + 수정 10파일) · 기준: `plan.md` FR-1/2/3, AC 전항

## 판정: 조건부 통과

- **정적 검증**(typecheck / lint / build): 무오류 — 통과.
- **API 레벨 검증**(curl, Mock 경로 + Supabase-설정-미마이그레이션 경로): AC-1.1 / 1.2 및 Mock 동작(AC-2.7/3.5 데이터 계층) 확인.
- **브라우저 UI 시나리오**: **미수행(환경 제약)**. 이 샌드박스는 외부 네트워크가 없어 페이지가 로드하는 외부 스크립트(구글 애드센스 `pagead2.googlesyndication.com`)가 영원히 pending 상태로 남아 문서 `load`/document-idle 이벤트가 발화하지 않는다. 그 결과 브라우저 자동화 확장이 페이지에 스크립트를 주입하지 못해 screenshot / read_page / get_page_text 가 모두 45s 타임아웃(4회 이상 재시도·리로드 포함)했다. 더해 `.env.local`의 `NEXT_PUBLIC_KAKAO_MAP_KEY`가 주석 처리되어 있어 카카오맵 자체가 렌더되지 않으므로, 세차장 마커/팝업(Kakao CustomOverlay 기반)은 이 환경에서 원천적으로 화면 확인 불가.
- AC 실패는 **1건도 관측되지 않았다**. 정적·API·코드 레벨 근거가 모두 AC 충족과 일치한다. 미확인 항목은 전적으로 위 환경 제약에 기인하므로 폴백 규칙에 따라 **조건부 통과**로 판정한다.

---

## 정적 검증

| 단계 | 명령 | 결과 |
|---|---|---|
| 타입 | `npm run typecheck` (`tsc --noEmit`) | ✅ 무오류 |
| 린트 | `npm run lint` (`next lint`) | ✅ `No ESLint warnings or errors` |
| 빌드 | `npm run build` | ✅ 성공(전 라우트 생성, 오류 없음) |

---

## API 레벨 시나리오 결과 (curl)

Mock 마커를 실제로 관측하기 위해 두 개의 dev 서버를 띄워 두 경로를 모두 검증:
- **포트 3000**: `NEXT_PUBLIC_USE_MOCK=true` (그러나 `.env.local`에 Supabase 설정 존재 → `isSupabaseConfigured()`=true) → RPC 경로(미마이그레이션).
- **포트 3001**: 위에 더해 `NEXT_PUBLIC_SUPABASE_URL=`·`SUPABASE_SERVICE_ROLE_KEY=`를 공란으로 오버라이드 → `isSupabaseConfigured()`=false → **Mock 폴백 경로**.

| AC | 절차 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| AC-1.1 (Mock 폴백) | 3001에서 서울 bbox 호출 | 200 + mock 마커 배열 | 200, `places=6`, `washType`={self,hand,auto,unknown}, 각 name/lat/lng 포함 | ✅ |
| AC-1.1 (500 없음) | 3000(Supabase 설정+미마이그레이션)에서 서울 bbox | 500 없이 200 | 200 + **빈 배열**(RPC 실패를 `catch`→`console.warn`+`[]` 폴백) | ✅ |
| AC-1.2 (미적재 안전) | 대양 bbox / 미마이그레이션 | 200 + 빈 배열 | `{"places":[],...}` HTTP 200 | ✅ |
| 입력 검증 | `swLat=abc` 등 비수치 | 400 | HTTP 400 `invalid bbox` | ✅ |
| AC-2.7/3.5 (Mock 데이터) | 3001 mock 응답의 유형 분포 | 4유형 혼재 | self/hand/auto/unknown 모두 존재 → 유형 필터 데모 가능 | ✅ (데이터 계층) |

---

## 콘솔 에러

- 로드 직후 콘솔: React DevTools 안내(INFO) 3건뿐. **에러/경고 0건**, 세차장 관련 예외·크래시 로그 없음.
- 카카오맵 키 부재로 `loadKakao()`가 조기 reject되지만 `KakaoMap`이 `catch`로 흡수(에러 상태 렌더)하여 콘솔에 표출되지 않음 — 크래시 아님.

---

## 모바일·다크모드 확인 결과

- **미수행(환경 제약)**. 위 브라우저 주입 불가로 뷰포트 리사이즈/테마 토글 화면 확인 불가.
- 코드 레벨 확인: 팝업/필터바/범례 모두 `sm:` 분기 + `dark:` 페어를 갖추고 있음(예: `CarwashPopup`는 모바일 하단시트 `items-end`/`sm:items-center`, 라이트·다크 뱃지 클래스 페어 `BADGE_CLASS`; FilterBar 2행 세그먼트 `dark:` 페어). 정적 확인만 가능.

---

## 코드 레벨 AC 확인 (브라우저 미수행분 보강)

세차장 마커/팝업/필터 UI는 Kakao 오버레이·React 렌더라 이 환경에서 화면 확인은 불가하나, 구현 코드로 각 AC의 충족을 확인:

| AC | 근거 | 판정 |
|---|---|---|
| AC-1.3 (개인정보 제외) | 마이그레이션/types/db/mock/api 어디에도 대표자·owner 필드 없음(주석의 "제외" 언급만). grep 0건 | ✅ 코드 |
| AC-1.4 (부설 제외) | `sync-carwash/route.ts`: 업종명에 '주유'·'충전' 포함 행 `continue`(skippedAffiliated) | ✅ 코드 |
| AC-1.5 (좌표 가드) | 동 파일 KR bbox 상수(위 33~39 / 경 124~132) 밖 행 드랍 | ✅ 코드 |
| AC-1.6 (실패 안전) | 다운로드/파싱/upsert 실패 시 `{ok:false, error, note:'existing table kept (no truncate)'}` 반환, truncate 경로 없음 | ✅ 코드 |
| AC-1.7 (bbox 조회) | RPC 반환 매핑 `rpcRowToMarker`가 name/washType/lat/lng 포함(런타임 확인은 DB 필요 → 미실행) | ⚠️ 코드만 |
| AC-2.1 (레이어 전환) | `FilterBar` '세차장' 칩 → `setLayer('carwash')`, `aria-pressed={isCarwash}`; `KakaoMap` 일반/가격 마커 effect는 `layer!=='gas'`면 제거만 하고 종료(가격 마커 사라짐) | ✅ 코드 |
| AC-2.2 (부설 칩과 구분) | '세차 가능' 칩·`BrandFilter` 모두 `isGas` 가드(carwash 시 숨김, gas 복귀 시 복원); 라벨 '세차 가능'(부설) vs '세차장'(레이어)로 상이 | ✅ 코드 |
| AC-2.3 (팝업/전화 조건부) | `CarwashPopup` 이름·유형 뱃지·주소 표시, `tel && (...)`로 전화 없으면 CTA 미렌더 | ✅ 코드 |
| AC-2.4 (운영/요금 조건부) | `hours`/`fee`가 null이면 해당 `InfoRow` 자체 미렌더(빈값·undefined 노출 없음) | ✅ 코드 |
| AC-2.5 (유형 미확인) | `WASH_TYPE_LABEL.unknown='유형 미확인'` 뱃지 표기; `normalizeWashType`이 4분류 외 값을 unknown 보정 | ✅ 코드 |
| AC-2.6 (노후 고지) | 팝업 하단 "공공데이터 기준이라 실제와 다를 수 있어요(폐업·정보 변경 가능)…"; 범례 carwash 섹션 동일 고지 | ✅ 코드 |
| AC-2.8 (출처 표기) | 팝업·범례에 "출처: 행정안전부 전국세차장표준데이터" | ✅ 코드 |
| AC-3.1 (필터 노출 조건) | FilterBar 2행 세그먼트 `{isCarwash && (...)}` — gas/ev에서 미노출 | ✅ 코드 |
| AC-3.2 (셀프 필터) | `visibleCarwash = carwashType==='all' ? all : filter(washType===carwashType)`; KakaoMap은 전달된 목록만 그림 | ✅ 코드 |
| AC-3.3 (전체 기본) | `stores/map.ts` `carwashType:'all'` 초기값 | ✅ 코드 |
| AC-3.4 (미확인 정직) | 'all'은 unknown 포함, 팝업 뱃지 "유형 미확인" — 임의 채움 없음 | ✅ 코드 |
| 길안내 모달(수정) | `NaviConfirm` `kind='carwash'` → noun='세차장', to='으로', "이 세차장으로 길안내를 시작할까요?"; carwash 분기에서 브랜드·`₩price` 줄 숨기고 거리만 노출("주유소/자영기타/₩0" 미노출) | ✅ 코드 |

빈 상태(AC-1.2/2.7 UI): `app/page.tsx`에 `layer==='carwash' && carwashLoaded && visibleCarwash.length===0` 오버레이 배너 존재 — 진짜 0건("이 지역에 표시할 세차장이 없어요…") vs 필터로 0개("선택한 유형의 세차장이 없어요…")를 구분. (렌더 화면 확인은 미수행)

---

## 발견 문제 상세

### [경미 / 불일치] `lib/db/carwash.ts`가 `NEXT_PUBLIC_USE_MOCK=true`를 존중하지 않음
- **현상**: `queryCarwashByBbox`는 `!isSupabaseConfigured()`일 때만 mock을 반환한다. 즉 Supabase가 설정된 환경에서 `NEXT_PUBLIC_USE_MOCK=true`로 데모/Mock을 의도해도 실제 RPC(`rpc_carwash_by_bbox`)를 호출한다.
- **plan 대비**: AC-1.1 문구는 "`NEXT_PUBLIC_USE_MOCK=true` **또는** Supabase 미설정 상태에서 … mock 마커 배열(또는 빈 배열)"이라 플래그도 mock 트리거로 기술한다. 코드는 후자(Supabase 미설정)만 처리.
- **판정에 미반영 이유**: (1) AC-1.1의 **하드 요건**("500 없이 200 + 배열 또는 빈 배열")은 어떤 경우에도 충족된다(미마이그레이션 시 RPC 실패→`[]`). (2) 이 패턴은 기존 `lib/db/ev.ts`와 **동일한 관례**로, 신규 회귀가 아니다. 다만 코드베이스의 다른 모듈(`lib/db/stats.ts:258`, `lib/forecast/accuracy.ts:87/238`)은 `process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()`로 플래그를 함께 존중한다 — 일관성 측면의 개선 여지.
- **재현**: Supabase env 설정 + `NEXT_PUBLIC_USE_MOCK=true` + 마이그레이션 미적용 → `/api/carwash/bbox` = 200 + **빈 배열**(mock 6건 아님). 본 QA의 포트 3000 관측치가 이에 해당.
- **권고(senior-developer)**: EV와의 관례 통일을 유지하려면 현행 유지 가능하나, plan AC-1.1 문구와 stats/accuracy 관례에 맞추려면 `lib/db/carwash.ts`(및 필요 시 `lib/db/ev.ts`)의 폴백 조건을 `process.env.NEXT_PUBLIC_USE_MOCK === 'true' || !isSupabaseConfigured()`로 확장 검토.

---

## 미해결 / 리스크

1. **브라우저 UI 실측 미수행(환경)**: 외부 네트워크 부재로 AdSense 외부 스크립트가 문서 load를 막고, 카카오맵 키(주석 처리)로 지도가 렌더되지 않아 세차장 마커/팝업/유형 필터/모바일·다크모드의 **화면 검증을 하지 못했다.** 실 브라우저 검증은 (a) 유효한 `NEXT_PUBLIC_KAKAO_MAP_KEY`와 (b) 외부 네트워크(또는 AdSense 비활성) 환경에서 재수행 필요. 커밋 전 최소 한 번의 실환경 스모크 권장.
2. **AC-1.4~1.7 런타임 미검증(DB)**: 마이그레이션이 프로덕션 미적용이라 sync 임포트 가드(부설/좌표 제외), 실패 안전(전체삭제 금지), bbox RPC 응답은 코드 레벨로만 확인. 마이그레이션 적용 + sync 1회 실행 후 별도 확인 필요(성공 지표의 washTypeDist·부설 제외 0건 등).
3. **`NEXT_PUBLIC_USE_MOCK` 미존중**(위 발견 문제): AC-1.1 하드 요건은 충족하나 문구/관례 불일치. 개선 여지.
4. **변경 범위 밖(참고)**: `.env.local`의 카카오맵 키가 주석 처리되어 있어 이 개발 환경에서는 지도 기능 전반(주유소 포함)이 화면 렌더되지 않는다. 세차장 변경과 무관한 로컬 환경 설정 이슈로 기록.
