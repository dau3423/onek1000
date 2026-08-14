# 사이클 요약: 이모지/문자 글리프 → 공용 SVG 아이콘 전면 교체 + 뒤로가기/닫기/즐겨찾기 UX

- 사이클 폴더: `docs/improvements/2026-08-14-ux-polish-emoji-to-icons/`
- 일자: 2026-08-14
- 페이즈: 기획 페이즈(승인) → 실행 페이즈(본 문서)

## 주제와 선정 이유

사용자 화면에 렌더되는 이모지/문자 글리프(약 40개 파일·70여 지점)가 (1) OS/폰트별 렌더 편차·미지원 글리프(🗗/⛶) 깨짐 위험, (2) 스크린리더가 "이모지"로 낭독하는 접근성 결함, (3) 뒤로가기/즐겨찾기 36px 탭 타깃 미달을 유발했다. 코드베이스에 이미 인라인 SVG(currentColor, viewBox 24) 패턴이 표준으로 존재하고 SRS가 "불필요한 의존성 추가 없음"을 요구하므로, **의존성 없는 공용 인라인 SVG 아이콘 세트**를 신설해 전면 교체하는 것이 사용자 가치(일관·접근성·조작성) 대비 비용이 가장 좋았다.

## 단계별 산출물

- 조사: [research.md](research.md) — A-1 이모지 전수 인벤토리, B 화면 UX 불편 지점, 교체 방식 근거
- 기획: [plan.md](plan.md) — FR-1(아이콘 세트+전면 교체, G1~G4), FR-2(BackButton/CloseIcon 공용화·44px·FavoriteButton 접근성), AC-1-1~8·AC-2-1~5. **AC-2-2는 실행 페이즈 착수 시 "목적지 불변" 원칙으로 보정**(design.md 실측 매핑과 일치)
- 디자인: [design.md](design.md) — 아이콘 세트 시각 사양, §1-3 인벤토리 매핑표, §1-4 크기 매핑, §2 의미색 팔레트, §3 기능 글리프 상태 디자인, §4 FR-2 컴포넌트, §5 route 내 위치 A안, §6 그룹별 적용표
- QA: [qa-report.md](qa-report.md)

## 구현 요약 (그룹 단위 G1→G2→G3→G4)

- **신규**: `components/icons/index.tsx` — 43개 네임드 SVG 컴포넌트 + `SPARKLE_SVG_STRING`. viewBox 24 / currentColor / 기본 aria-hidden / props {className?} / 'use client' 없음(서버 컴포넌트 import 가능) / Lucide(ISC)·Heroicons(MIT) 고지 주석. **신규 npm 의존성 0**.
- **G1 (지도·공통 UI·배너)**: app/page.tsx(경로 표시줄·GPS 3-상태·전체화면 토글·토스트), Header/FilterBar/BottomSheet/MarkerLegend, KakaoMap TOP10 ✦(SPARKLE_SVG_STRING, span 래퍼·애니메이션 유지), 알림 배너 3종(닫기 40px 예외 주석).
- **G2 (상세·리뷰·EV)**: station/ev 상세 라벨, FavoriteButton(§4-3: HeartFilled red-500 + aria-pressed 신규 + 44px), StarRating(§3-1: 오버레이 클리핑 반 별 3-상태), 리뷰 폼(사진삭제 28px 예외 주석), EvStationPopup 등.
- **G3 (마이페이지 계열)**: BackButton 3-모드 확장(히스토리/Link/label), my 메뉴 7종·서브 페이지 뒤로가기(목적지 불변 Link), 알림톡/푸시/예보/리포트/차량/관심지역/PWA/추천 컴포넌트.
- **G4 (결제·경로·검색·기타)**: pricing(히어로·표)/billing/route(내 위치 §5 A안)/search(BackButton 히스토리+aria-label 신규)/legal(label 모드)/regions 브레드크럼/InterstitialAd.
- **범위 밖 보정 5파일**: AC-1-1 "JSX 렌더 경로 0건" 게이트 충족 위해 StationPopup(닫기 36→44px), BannerAd·ForecastMiniCard("자세히 →"), SignInClient·ForecastDrivers(산문 → 리워딩) 추가 수정. 리뷰에서 타당·부작용 없음 확인.

## 변경 파일 요약

- 소스 57개 수정 + `components/icons/index.tsx` 신규(총 58 소스 파일). 문서: plan.md 보정, BACKLOG.md 갱신, cycle-summary.md·qa-report.md 신규.

## 리뷰·QA 판정

- **코드 리뷰: ✅ 머지 가능** — Critical/Major 0건. Minor 2건(경로 표시줄 truncate 실기기 확인, 별점 입력 32px는 명세 허용 예외)은 블로킹 아님.
- **QA: 조건부 통과** — AC 실패 0건. typecheck/lint/build 통과, AC-1-1 grep 렌더 경로 0건, package.json 의존성 0, 서버 렌더 프로브로 주요 화면 SVG 렌더·글리프 0 확인, AC-2-2 목적지 매핑 코드 일치. **단, Chrome 브라우저 자동화가 환경상 불가하여 별점 탭·즐겨찾기 토글·GPS 상태 전이·다크모드 시각·픽셀 탭 타깃의 실화면 인터랙티브 검증은 미수행(브라우저 검증 미수행).**

## 미해결·리스크

1. **브라우저 인터랙티브 검증 미수행**: 별점 반 별 시각, 즐겨찾기 토글 색, GPS 3-상태 전이, 전체화면 아이콘 스왑, 다크모드 crown 금색, 44/40/28px 픽셀 탭 타깃은 코드 근거로만 판정. 브라우저 확장 연결 환경에서 재확인 권장.
2. **KakaoMap ✦ 크기 변화**: 원본은 span font-size로 9px/7px 차등이었으나 SVG는 12px 고정 → 두 반짝이 동일 크기. 위치·애니메이션·색 불변. 실기기 반짝임 확인 권장.
3. **경로 표시줄 truncate**: inline-block ChevronRight 자식이 있어도 single-line ellipsis는 통상 유지되나 매우 긴 지명에서 실기기 1회 확인 권장.
4. **다크 미지원 페이지 아이콘 색**: 라이트 전용 색을 넣었으므로 향후 B-2(다크모드 사이클)에서 함께 `dark:` 보정 필요(BACKLOG에 이관 메모 기재).
5. **감성 저하 가능성**: pricing 히어로(💸→Coins)·결제(🎉→PartyPopper, 💳→CreditCard) 단색 SVG는 이모지 대비 밋밋할 수 있음. 기능 요건(문자 제거+높이 불변)은 충족. 추후 브랜드 일러스트 사이클 여지.

## 이월 여부

**없음.** G1~G4 전부 이번 사이클에서 완료. 승인 조건 3의 필수 완료선(G1·G2)은 물론 G3·G4까지 모두 구현·검증 완료.

## 다음 사이클 제안

1. **다크모드 미적용 페이지 정합(B-2)** — 규모 큰 미완 항목. 이번에 심은 라이트 전용 아이콘 색 `dark:` 보정을 체크리스트에 포함. 페이지 단위(상세 > 검색 > 마이 > pricing) 분할 진행.
2. **방향 배지 글리프(▲▼─·↑) SVG화** — 이번 grep 범위 밖으로 남은 소규모 잔재. 일관성 차원 후속 정리(비용 소).
