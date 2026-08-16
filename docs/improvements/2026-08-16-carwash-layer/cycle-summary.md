# 사이클 요약: 독립 셀프·손세차장 지도 레이어

> 완료일: 2026-08-16 · PM 총괄 · 실행 페이즈(사용자 승인 후)

## 주제·선정 이유
- 직전 세차 사이클(C2, 커밋 583f6e4)이 넣은 것은 **주유소 부설 세차 필터**(`has_carwash`)뿐이라 "근처 셀프세차장 어디?"에는 답하지 못했다. 조사(`2026-08-16-carwash-places-research/research.md`)에서 행정안전부 「전국세차장표준데이터」(16,186행, WGS84 좌표 99.96% 채움, 무료·이용허락 제한 없음·무인증)를 확정 데이터 소스로 검증했고, EV 충전소 레이어 파이프라인을 거의 그대로 복제하면 낮은 비용으로 독립 세차장 레이어를 신설할 수 있어 채택했다.

## 단계별 산출물
- 조사: [../2026-08-16-carwash-places-research/research.md](../2026-08-16-carwash-places-research/research.md)
- 기획(FR/AC): [plan.md](plan.md)
- 디자인(와이어프레임/컴포넌트 매핑): [design.md](design.md)
- QA 리포트: [qa-report.md](qa-report.md)

## FR별 구현 요약
- **FR-1 데이터 파이프라인**: `supabase/migrations/0038_carwash_places.sql`(테이블 + `rpc_carwash_by_bbox`, 대표자명 컬럼 없음), `app/api/internal/sync-carwash/route.ts`(CRON_SECRET 401 가드, Referer 헤더, cp949 디코딩, 청크 upsert, 부설/좌표0/한반도bbox 제외, 유형 정규화, 실패 안전=truncate 금지, washTypeDist 응답), `app/api/carwash/bbox/route.ts` + `lib/db/carwash.ts`(Redis 캐시 + Mock 폴백, 미마이그레이션/0건에도 200+빈배열), `lib/mock/carwash.ts`.
- **FR-2 레이어 UI**: `MapLayer`에 `'carwash'` 추가, FilterBar 신규 '세차장' 레이어 칩(기존 부설 칩은 '세차 가능'으로 개명, 계측 키 불변), `CarwashIcon`, `components/map/CarwashPopup.tsx`(유형 뱃지·조건부 렌더·길안내 단독 CTA·출처/노후 고지), `lib/map/carwashMarker.ts`(유형 4색 핀+글리프), `KakaoMap`/`MarkerLegend`/`app/page.tsx` carwash 분기, 빈 상태 오버레이 배너.
- **FR-3 유형 필터**: `carwashType`('all'|'self'|'hand'|'auto', 기본 'all') + 세그먼트 UI(carwash 레이어 한정, role=radiogroup) + 클라이언트 필터.

## 변경 파일
- 신규(8): `supabase/migrations/0038_carwash_places.sql`, `app/api/internal/sync-carwash/route.ts`, `app/api/carwash/bbox/route.ts`, `lib/db/carwash.ts`, `lib/mock/carwash.ts`, `types/carwash.ts`, `lib/map/carwashMarker.ts`, `components/map/CarwashPopup.tsx`
- 수정(9): `stores/map.ts`, `components/icons/index.tsx`, `components/ui/FilterBar.tsx`, `components/map/KakaoMap.tsx`, `components/ui/MarkerLegend.tsx`, `lib/cache/redis.ts`, `app/page.tsx`, `components/alert/NaviConfirm.tsx`, `.env.example`

## 리뷰·QA 판정
- **코드 리뷰**: 1차 조건부(Major 1: 세차장 길안내 모달이 주유소용 NaviConfirm 재사용해 "주유소·자영/기타·₩0" 노출) → 수정 → **2차 승인**(Critical/Major/Minor 0). NaviConfirm에 `kind` 옵션 추가로 세차장 문구·가격 은닉, 주유소/EV 경로 회귀 없음. 부수로 빈 상태 배너 유형 구분 + 팝업 유형별 글리프 반영.
- **QA**: **조건부 통과**. 정적 검증(typecheck/lint/build) 전부 무오류. API 레벨(curl)로 AC-1.1/1.2 실측(mock 200+6건, 미마이그레이션 200+빈배열, 비수치 400). 코드 레벨로 나머지 AC 충족, 관측 실패 0건. **브라우저 UI 실측만 환경 제약(외부 네트워크 없음 + 카카오맵 키 주석 처리)으로 미수행** — 앱 결함 아님. QA 발견 정합성 개선(USE_MOCK 플래그 미존중)은 커밋 전 반영 완료.

## 후속(운영자 필수 작업)
1. **마이그레이션 적용**: `supabase/migrations/0038_carwash_places.sql`를 프로덕션 DB에 수동 적용(PostGIS geography + GiST 인덱스 포함). 미적용 시 레이어는 빈 상태로 안전 동작(크래시 없음).
2. **데이터 적재**: 마이그레이션 적용 후 `POST /api/internal/sync-carwash`(`Authorization: Bearer ${CRON_SECRET}`) 1회 실행. 응답의 `washTypeDist`로 self/hand/auto/unknown 분포 실측.
3. **크론 등록**: `sync-carwash`를 주 1회 스케줄로 등록(원천 "수시" 갱신). 기존 internal 크론 패턴 준수.

## 미해결·리스크
- 유형 62% 미기재 예상 → "유형 미확인" 정직 표기 + 필터 기본 '전체'. 실제 unknown 비율은 적재 후 실측(크라우드소싱 후속 판단 근거).
- 다운로드 엔드포인트(`file.localdata.go.kr`) 비공식성 → URL 변경/중단 리스크. sync 실패 안전(전체삭제 금지)으로 방어하나 운영 알림은 후속.
- 유형 필터 클라이언트 vs 서버(`type=`): 클라이언트 기본안 채택. `CARWASH_LIMIT=200` 상호작용은 적재 후 실측.
- 브라우저 UI 스모크 미수행: 유효 카카오맵 키 + 외부 네트워크 환경에서 칩 aria-pressed/팝업/유형 필터/NaviConfirm 문구/다크모드 1회 확인 권장.
- EV 충전소 길안내도 동일한 "주유소·₩0" 잠재 이슈(NaviConfirm에 `kind='ev'` 추가로 정리 가능) — 이번 범위 밖, 후속 제안.

## 다음 사이클 제안
1. **세차장 v2 — 부설 중복 병합 + 크라우드소싱 유형/폐업 제보**: 적재 후 unknown 비율·좌표 품질 실측을 근거로 상호·좌표 근접 병합 및 제보 UI(모더레이션 포함).
2. **EV 길안내 문구 정리 + `/regions` 세차장 롱테일 SEO**: NaviConfirm `kind='ev'` 반영 및 "OO동 셀프세차장" 시도별 목록 허브(v1은 지도 레이어만).
