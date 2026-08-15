# 사이클 요약 — 유종(연료 종류) 전면 반영

- 사이클 폴더: `docs/improvements/2026-08-15-fuel-type-consistency/`
- 상태: **실행 페이즈 완료 — 커밋됨** (QA 조건부 통과)
- 날짜: 2026-08-15 (기획) / 2026-08-16 (실행)

## 주제와 선정 이유
"지도에서 경유/LPG를 선택한 사용자가 검색·상세로 넘어가는 순간 휘발유(B027)로 되돌아가는 일관성 결함"을 해소한다. 신규 기능이 아니라 SRS FR-1.3과 실제 구현의 정합성 갭이다.

백로그 자율 선정(사용자 대면 개선 가중치) 결과 3개 후보를 비교했다:

| 후보 | 대상 세그먼트 | 실측 비용 | 판정 |
|---|---|---|---|
| **유종 전면 반영(채택)** | 경유+LPG ≈ 등록차 44%, 서비스 타깃(물류/라이더)과 일치 | 소~중(약 7파일, DB 변경 0, 기존 인프라 재사용) | 채택 |
| A4 공유 루프 | 전체 중 공유 의향자(DAU 150에서 모수 작음) | 중 | 차점 — 유종 미정합 상태면 공유 카드가 절반 사용자에게 틀린 가격. 순서상 유종 후행 |
| 다크모드 정합 | OS다크∩해당페이지 방문자(규모 미상) | 대(10+파일+아이콘 색 보정) | 1사이클 초과 실측 → 후순위 |

선정 근거: ① 기존 사용자 44% 세그먼트의 핵심 과업(내 유종 최저가 확인)이 즉시 완결 ② 낮은 비용/기존 인프라 재사용 ③ 검색 inner join으로 인한 LPG 전용 충전소 검색 누락 버그를 함께 흡수. 미채택 후보는 BACKLOG에 유지.

## 단계별 산출물
- 조사: [research.md](research.md)
- 기획: [plan.md](plan.md)
- 디자인: [design.md](design.md) — 화면 변경 있어 수행
- QA: [qa-report.md](qa-report.md)

## 확정 범위 (FR 3개) — 전량 구현
- **FR-1** 검색 유종 반영 (+ 비휘발유 전용 업소 검색 누락 버그 수정 = left join화)
- **FR-2** 상세 가격추이 유종 탭 (+ 주유기록 단가 B027 고정 수정)
- **FR-3** 셀프 필터 칩 (등유 K015 칩은 Out — 백로그 유지)

## 변경 파일 요약
수정(7): `app/api/search/route.ts`(product 파라미터 + inner→left join + mock 유종), `app/search/page.tsx`(유종 라벨/셀프 배지/가격없음/컨텍스트 캡션), `app/station/[id]/page.tsx`(추이 래퍼 + 단가 연동으로 교체), `components/station/FuelLogButton.tsx`(productLabel prop), `components/ui/FilterBar.tsx`(셀프 칩), `app/page.tsx`(selfOnly visible 필터 결합), `stores/map.ts`(selfOnly/toggleSelfOnly).
신규(3): `components/station/FuelSelectionProvider.tsx`(상세 스코프 유종 컨텍스트, DOM 무개입으로 섹션 순서 보존), `components/station/PriceTrendSection.tsx`(유종 탭 + 차트), `components/station/FuelLogSelectedButton.tsx`(선택 유종 단가 주입).

## 리뷰·QA 판정
- **코드 리뷰**: 조건부 → Major 1건(`/api/search` product 화이트리스트의 `in` 프로토타입 체인 우회, AC-5 위반) 지적 → `Object.keys(PRODUCT_LABEL).includes(...)`로 수정 → **재리뷰 승인(머지 가능)**.
- **QA**: **조건부 통과**. typecheck/lint/build 무오류. 재현 가능한 모든 AC 시나리오 성공, 실패 AC 없음. 환경 제약으로 아래는 브라우저 미검증(코드 확인으로 갈음):
  - FR-1 AC-2/3(LPG 전용 충전소 누락 복구·"가격 정보 없음"): Mock 시드가 전 유종 non-null이라 재현 불가 → **실 DB 표본 검증 필요**. 단 left join 동작 자체는 구현 중 실 Supabase 표본(지에스칼텍스 영통주유소, C004 전용)으로 1회 검증 완료(inner:0건 → left:1건).
  - FR-3 AC-2/3/6(마커/시트 셀프 필터 시각): `NEXT_PUBLIC_KAKAO_MAP_KEY` 미설정으로 지도 미로드 → 필터 로직은 코드 확인.
  - 다크모드: 런타임 강제 불가 → dark: 쌍 정합 코드 확인.

## 구현 판단 메모
- **left join 경로 채택**(2쿼리 대안 불필요) — 실 Supabase 검증으로 "부모 행 유지 + 임베드만 필터" 동작 확정.
- FR-2 섹션 순서 보존: Context.Provider(DOM 노드 없음)로 서버 섹션들을 children으로 감싸 시각/DOM 순서 불변.

## 미해결/리스크
- **실 DB 브라우저 검증 잔여**: LPG 전용 충전소 검색 누락 복구·"가격 정보 없음" 표기·FR-2 폴백(LPG 미취급소)은 실 데이터 환경에서 배포 후 스모크 확인 권장.
- FR-3 마커/시트 셀프 필터 시각 검증은 카카오 지도 키 있는 환경에서 확인 권장.
- 전국 TOP10 크라운 핀 셀프 미적용은 의도된 예외(백로그 이관).

## 다음 사이클 제안
1. A4 공유 루프(상세/TOP10 공유 버튼 + 주유소별 동적 OG) — 유종 정합 완료로 공유 카드 가격이 정확해진 지금이 적기.
2. 전국 TOP10 크라운 핀 `isSelf` 확장(셀프 필터 일관 적용) — 이번 예외 해소.
