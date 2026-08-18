# 번역 검수 요청 (Task 12)

대상: 한국어를 모르지만 중국어 또는 일본어를 읽을 수 있는 검수자. 10분 안에 끝낼 수 있도록
**확신이 낮은 항목부터** 배치했다. 이미 정리가 끝난 항목(영어 표기 통일 등)은 뒤쪽 부록에만
남겨뒀으니 굳이 훑지 않아도 된다.

## 무엇을 번역했고, 무엇을 의도적으로 한국어로 남겼나

- UI 문구(버튼·라벨·안내 문구·에러 메시지 등) 661개 키를 en/zh/ja 3개 언어로 번역했다.
- **다음은 의도적으로 번역하지 않고 한국어 원본을 그대로 노출한다**: 주유소·전기차 충전소·세차장의
  상호명과 주소, 공지사항 본문, 리뷰 본문. 외국인 운전자는 이 값들을 내비게이션 앱이나 실제
  현장 간판과 대조해야 하므로, 번역하면 오히려 못 찾는다. DB 원본 그대로 노출하는 게 맞다.
- **en 번역이 zh/ja보다 신뢰도가 높다.** en은 이번 태스크에서 표기 일관성까지 정리했지만,
  zh/ja는 초벌 번역 상태다. **검수 없이 zh/ja를 배포하면 어색하거나 부정확한 문구가 사용자에게
  노출될 수 있다.** 배포 여부는 검수 후 결정해달라.

## 1. 확신이 낮은 항목 — 검수 필요

| 키 | ko | zh | ja | 왜 확신이 낮은가 |
|---|---|---|---|---|
| `labels.brand.RTE` | 알뜰주유소 | Alddle平价加油站 | アルトゥル(格安) | 정부 주도 알뜰주유소 제도는 한국 고유 제도라 정착된 외국어 표기가 없다. "Alddle"은 한국어 발음을 로마자로 옮긴 조어로, 외국인이 이 이름만 보고 무엇인지 알기 어려울 수 있다. |
| `labels.brand.RTO` | 자영알뜰 | 自营平价 | 自営アルトゥル | RTE와 같은 이유. "자영"(직영이 아닌 개인 운영) 뉘앙스가 zh/ja에 제대로 전달되는지 확인 필요. |
| `labels.brand.HDO` | 현대오일뱅크 | 现代Oilbank | 現代オイルバンク | 회사의 공식 영문명은 **"HD Hyundai Oil Bank"**(Oil과 Bank 사이 띄어쓰기 있음, 2023년 그룹 리브랜딩 이후 명칭)로 확인했다 — 현재 en 카탈로그 값 "HD Hyundai Oilbank"는 띄어쓰기가 다르다. zh/ja 쪽은 회사의 공식 중국어·일본어 표기를 찾지 못했다(웹 검색으로도 확인 안 됨) — "现代Oilbank"처럼 중국어와 영어를 섞은 표기가 자연스러운지, "現代オイルバンク"가 실제 통용되는 표기인지 검수자 확인이 필요하다. |
| `labels.product.B034` | 고급휘발유 | 高级汽油 | ハイオク | ja는 직역(高級ガソリン)이 아니라 일본에서 실제로 쓰는 통용어 "ハイオク"(하이옥탄의 줄임말)를 썼다. 자연스러운 선택으로 보이지만, 일본어 원어민 검수로 확인이 필요하다. |

## 2. 오너가 결정할 사항 (번역 문제 아님)

`common.appName`이 현재 로케일별로 다르게 번역되어 있다:

| 로케일 | 현재 값 |
|---|---|
| ko | 1000냥 주유소 |
| en | 1000 Won Gas Station |
| zh | 千元加油站 |
| ja | 1000ウォンガソリンスタンド |

브랜드명은 보통 번역하지 않는다(카카오·네이버가 각 언어권에서도 "Kakao"·"Naver"로 남는 것처럼).
하지만 이 서비스의 외국어 화면 대상은 **한국어를 못 읽는 외국인 운전자**이므로, "1000냥"을
그대로 두면 어떤 의미인지 전혀 전달되지 않는다는 반론도 있다.

- **옵션 A (현행 유지)**: 로케일별 의역 유지. 의미는 통하지만 브랜드 통일성이 깨진다.
- **옵션 B (브랜드명 통일)**: 모든 로케일에서 "1000냥 주유소"(또는 로마자 "1000nyang")를 그대로 쓰고,
  필요하면 부제로 의미를 보충한다. 브랜드 자산은 지키지만 의미 전달력이 떨어진다.

이건 번역 품질 문제가 아니라 **브랜드 전략 결정**이라 이번 태스크에서 임의로 바꾸지 않았다.
오너가 정할 사항이다.

## 3. 알려진 후속 과제 (의도적으로 미룸)

이벤트 핸들러 안에서 `useState`로 저장되는 번역 문자열(주로 폼 검증·에러 메시지)이 있다.
예: 사용자가 en 화면에서 실수로 필드를 비우고 제출 → "Please enter text" 같은 영어 에러가
`useState`에 저장됨 → 그 직후 사용자가 zh로 언어를 전환해도, 이미 저장된 에러 문자열은
다음 상호작용(다시 제출하거나 에러가 사라질 때)까지 영어로 남아있다.

확인된 대상 컴포넌트(12개, 폼 검증/에러 메시지 패턴):
`app/(intl)/route/page.tsx`, `app/(intl)/auth/reset-password/ResetPasswordClient.tsx`,
`app/(intl)/auth/sign-in/SignInClient.tsx`, `components/interest/InterestRegionManager.tsx`,
`components/vehicle/VehicleManager.tsx`, `components/ev/EvChargeLogButton.tsx`,
`components/profile/ProfileHeader.tsx`, `components/profile/AlimtalkToggle.tsx`,
`components/station/FuelDwellPrompt.tsx`, `components/station/FuelLogButton.tsx`,
`components/reviews/ReviewSection.tsx`, `components/reviews/ReviewForm.tsx`.

**의도적으로 미뤘다.** 각 인스턴스는 다음 상호작용에서 스스로 정리되는(self-clearing) 일시적
상태라 실사용 영향이 작고, 언어 전환 시점에 폼을 열어둔 상태로 마침 에러가 떠 있어야만 보이는
드문 경우다. 이번 태스크 막바지에 컴포넌트 12개를 전부 고치는 것은 회귀 위험이 그 결함보다
컸다고 판단했다.

---

## 부록 — 이미 정리된 항목 (참고용, 검수 불필요)

Task 12에서 en/zh/ja 표기 불일치를 정리했다. 아래는 정리 결과와 "정리하지 않은" 판단의 근거다.
검수자가 재확인할 필요는 없지만, 왜 일부는 그대로 뒀는지 궁금하면 참고.

- **정리함(영어)**: "셀프" 계열 → `map.selfService`를 "Self-serve"에서 "Self-service"로 통일
  (`station.self`/`search.selfBadge`와 동일하게). `map.carwashFilter.self`만 "Self"로 남김 — 좁은
  필터 칩이라 짧은 표기가 맞다.
- **정리함(영어)**: "로그인" 계열 → `map.header.login`/`station.review.login`을 "Sign in"으로 통일
  (auth.* 네임스페이스 전역에서 이미 "Sign in"이 압도적으로 많이 쓰이는 표기였다).
- **정리함(중국어)**: `map.carwashFilter.hand`(손세차 필터 칩)를 "手工洗车"에서 "手洗"로 —
  en/ja는 필터 칩과 마커 라벨이 이미 동일한 문구를 쓰는데 zh만 갈라져 있었다.
- **정리함(중국어·일본어)**: "1:1 문의" 문구의 괄호 스타일을 반각 `(`에서 카탈로그 전반의
  자연어 부연 설명에 쓰이는 전각 `（`로 통일.
- **정리함(일본어)**: `길안내 시작` → `alert.navigateAria`를 "ナビを開始"에서 "経路案内開始"로 —
  카탈로그 전역에서 "길안내"는 8곳 이상 "経路案内"로 일관되게 쓰이는데 이 키만 "ナビ"를 썼다.
- **정리함(영어, 2차 수정)**: `map.filterBar.layerCarwash`("Car Wash"→"Car wash"),
  `station.navi.startNavigation`("Start Navigation"→"Start navigation"),
  `station.review.submit`("Submit Review"→"Submit review"),
  `station.review.addPhoto`("Add Photo"→"Add photo"). 1차 검수에서는 "버튼/헤딩 문구는
  타이틀 케이스, aria-label은 문장 케이스"라는 규칙으로 이 넷을 그대로 뒀으나, 카탈로그
  버튼/액션 키를 전수 조사한 결과 그 규칙의 후반부가 틀렸다 — 문장 케이스가 38건, 타이틀
  케이스는 이 4건뿐이었다(`Find cheapest along route`, `Open chat`, `Just save` 등이 다수).
  즉 버튼 문구의 지배적 규칙은 문장 케이스이고, 이 4건이 예외였다. (aria-label 쪽 규칙은
  맞았다 — 문장 케이스 25건 vs 타이틀 케이스 2건.) zh/ja는 해당 쌍이 이미 서로 일치하는
  값이라 영향 없음을 확인했다.
- **그대로 둠**: `{count}건`(로그/리뷰 — 한국어 "건"은 범용 단위지만 영어는 명사가 필요),
  `{count}회`(컴팩트 뱃지 vs 문장형 카운트), 셀프세차/자동세차의 `labels.washType.*` vs
  `map.carwashMarkerLabel.*`(마커는 의도적으로 짧게), `확인`(Confirm vs Got it — 서로 다른
  발화 행위), `등록 중…`(Submitting vs Registering — 대상이 다름), `{name} 상세 보기`
  (두 aria-label 모두 자연스럽게 읽힘), `고속도로`(브랜드 라벨 vs 경로 뱃지로 의미가 다름).

한국어 원문(ko.json)은 이번 정리에서 **한 글자도 바뀌지 않았다** — before/after 기계적 diff로
확인함.
