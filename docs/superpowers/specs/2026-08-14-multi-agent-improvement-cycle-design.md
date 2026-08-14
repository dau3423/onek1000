# 멀티 에이전트 개선 사이클 설계

- 날짜: 2026-08-14
- 대상: 1000냥 주유소 (전국 주유소 실시간 가격 지도 + GPS 최저가 알람 웹 서비스)
- 목적: 자료조사 → 기획 → UI/UX 디자인 → 개발 → 코드 리뷰 → QA로 이어지는 개선 사이클을
  PM 에이전트가 총괄 실행하는 멀티 에이전트 체계를 구축한다. 서비스가 사용자에게 더 편하고,
  쉽고, 효율적이고, 필요한 것이 되도록 사이클 단위로 점진 개선한다.

## 1. 확정된 운영 방식

| 항목 | 결정 |
|---|---|
| 총괄 방식 | `pm` 서브에이전트가 사이클을 총괄하되, **2단계 호출**로 나눔 — 기획 페이즈(조사→기획→디자인 후 종료·컨펌 요청) → 사용자 승인 → 실행 페이즈(구현→리뷰→QA→커밋) |
| 컨펌 게이트 | 신규 기능·디자인 변경은 **구현 전 사용자 컨펌 필수**. 사용자가 "컨펌 없이 한 번에"라고 명시한 경우에만 두 페이즈 연속 진행 |
| 주제 선정 | 하이브리드 — 사용자가 주제를 주면 그대로, 없으면 `researcher`의 백로그 분석 후 PM이 최고 가치 1개 자율 선정 |
| QA 방식 | 정적 검증(typecheck/lint/build) + Mock 모드 dev 서버 + Chrome 브라우저 자동화 실화면 시나리오 검증 |
| 결과 처리 | QA 통과 시 한국어 컨벤션(`feat:`/`fix:`)으로 **커밋까지만**. push/배포는 사용자가 직접 수행 |
| 모델 배정 | 자료조사·기획·디자인(researcher, product-planner, ux-designer) = `fable` / 개발·리뷰·QA·총괄(senior-developer, code-reviewer, qa-tester, pm) = `opus` (기존 2개는 `inherit`→`opus` 수정) |

## 2. 에이전트 구성

신규 5개를 `.claude/agents/`에 추가하고, 기존 `senior-developer`·`code-reviewer`는 그대로 재사용한다.
모든 에이전트는 기존 두 에이전트의 공통 원칙을 따른다: **SRS(`docs/요구사항_명세서.md`) 기준,
한국어 톤, 근거 기반 보고, 확신 없는 것을 "완료"라 말하지 않기.**

### pm (신규, 총괄)
- 역할: 단계별 에이전트 호출, 산출물 게이트 판정, 실패 루프 관리, 최종 커밋, 종합 보고.
- 도구: Agent, Read, Bash, Glob, Grep, Write, TodoWrite
- 제약: **코드를 직접 수정하지 않는다.** 구현·수정은 반드시 senior-developer에 위임.
- 산출물: `cycle-summary.md`

### researcher (신규, 자료조사)
- 역할: 서비스 현황(코드·docs·git 로그), 경쟁 서비스, 사용자 관점, 유가/지도 기술 동향 조사.
  개선 기회를 근거와 함께 발굴. 주제 미지정 사이클에서는 후보 백로그(5개 내외 + 가치/비용 근거) 작성.
- 도구: Read, Grep, Glob, Bash(읽기 전용), WebSearch, WebFetch, Write
- 산출물: `research.md`, 미채택 아이디어는 `docs/improvements/BACKLOG.md`에 누적

### product-planner (신규, 기획)
- 역할: research.md와 SRS를 바탕으로 요구사항 구체화 — 목표, 유저 스토리, 기능 요구사항(FR)과
  수용 기준(AC), 범위(in/out), 성공 지표. SRS에 반영할 변경이 있으면 제안 형태로 명시.
- 도구: Read, Grep, Glob, Write
- 산출물: `plan.md`

### ux-designer (신규, UI/UX 디자인)
- 역할: plan.md 기준으로 화면 흐름, 텍스트/ASCII 와이어프레임, 기존 컴포넌트(`components/`)와
  화면설계(`docs/04_화면설계.md`) 매핑, Tailwind·다크모드·모바일 safe-area 지침 작성.
- 도구: Read, Grep, Glob, Write
- 산출물: `design.md`
- 비고: UI 변경이 없는 주제(예: API 캐시 개선)면 PM이 이 단계를 생략할 수 있다.

### senior-developer (기존 재사용, 개발 및 테스트)
- plan.md + design.md를 기준 문서로 받아 구현. typecheck/lint/build 통과 책임.

### code-reviewer (기존 재사용, 코드 리뷰)
- 머지 가능(✅/⚠️/❌) 판정. ❌/⚠️ 지적 사항은 PM이 senior-developer에게 되돌려 수정시킨다.

### qa-tester (신규, QA 테스트)
- 역할: (1) `npm run typecheck`·`lint`·`build` 재확인, (2) Mock 모드(`NEXT_PUBLIC_USE_MOCK=true`)로
  dev 서버 기동, (3) Chrome 브라우저 자동화(claude-in-chrome MCP, ToolSearch로 로드)로 plan.md의
  수용 기준 시나리오를 실제 화면에서 검증. 모바일 뷰포트·다크모드 확인 포함.
- 도구: frontmatter에 `tools:`를 **의도적으로 생략**(모든 도구 상속 → ToolSearch·브라우저 MCP 접근). `tools:` 필드를 추가하면 브라우저 검증이 깨지므로 추가 금지.
- 산출물: `qa-report.md` (시나리오별 통과/실패 + 스크린샷 근거 서술)
- 폴백: 서버 기동 실패 등 환경 문제로 브라우저 검증이 불가능하면 정적 검증만으로
  "조건부 통과"를 보고하되 그 사실을 명시한다.

## 3. 사이클 흐름 (PM 내부 로직)

### 기획 페이즈 (1차 호출)
1. **주제 결정**: 사용자 주제가 있으면 그대로. 없으면 researcher에게 백로그 작성을 지시하고
   PM이 가치/비용 기준 최우선 1개 선정, 나머지는 BACKLOG.md에 누적.
2. **조사**: researcher → `research.md`
3. **기획**: product-planner → `plan.md`
4. **디자인**: ux-designer → `design.md` (UI 무관 주제면 생략)
5. **컨펌 요청으로 종료**: 구현 없이 종료. FR 목록·화면 변경점 요약·산출물 경로를 보고하고
   사용자 승인을 기다린다.

### 실행 페이즈 (승인 후 2차 호출)
6. 승인 메시지에 수정 지시가 있으면 product-planner/ux-designer로 문서 갱신 후 진행.
7. **구현**: senior-developer (기준: plan.md + design.md)
8. **리뷰**: code-reviewer. ❌/⚠️이면 지적 사항을 senior-developer에 전달해 수정 → 재리뷰.
   **최대 2회 루프**, 그래도 ❌면 실패 종료.
9. **QA**: qa-tester. 실패 시 senior-developer 수정 후 **재검증 1회**. 재실패면 실패 종료.
10. **마무리(통과/조건부 통과 시)**: PM이 한국어 컨벤션으로 커밋(**push 금지 — push는 사용자가 직접**),
    `cycle-summary.md` 작성, 최종 보고(변경 요약, 검증 결과, 리스크, 다음 사이클 제안).

### 실패 종료 시
- 커밋하지 않고 변경을 작업 트리에 남긴다.
- PM이 실패 단계, 원인, 현재 상태, 권장 다음 행동을 보고하고 사용자 판단에 맡긴다.

## 4. 파일 구조

```
.claude/agents/
  pm.md  researcher.md  product-planner.md  ux-designer.md  qa-tester.md
  (기존) senior-developer.md  code-reviewer.md

docs/improvements/
  BACKLOG.md                        # 개선 아이디어 누적 (채택 여부·근거 포함)
  YYYY-MM-DD-<주제slug>/
    research.md                     # 조사 보고
    plan.md                         # 기획서 (FR/AC/범위)
    design.md                       # UI/UX 명세 (해당 시)
    qa-report.md                    # QA 결과
    cycle-summary.md                # PM 종합 보고
```

- 각 산출물 문서 끝에는 **"미해결/리스크"** 섹션을 필수로 남겨 다음 단계·다음 사이클이 참고한다.
- 단계 간 인수인계는 이 파일들로 한다(파일 핸드오프). PM은 각 에이전트에게 앞 단계 문서의
  경로를 명시해 전달한다.

## 5. 사용 방법

- 기획 페이즈 — 주제 지정: "pm 에이전트로 ○○ 개선해줘" / 자율 선정: "pm 에이전트로 개선 사이클 돌려줘"
- 실행 페이즈 — 기획 검토 후: "pm으로 <사이클 폴더> 승인, 진행해줘" (수정 지시를 함께 줘도 됨)
- 주의: pm 서브에이전트는 실행 중 멈춰서 물어볼 수 없다. 컨펌 게이트는 사용자가 기획 보고를 검토한 뒤 **두 번째 호출**로 승인 의사를 전달해야 작동한다.
- 예외: "컨펌 없이 한 번에 진행해줘"라고 명시하면 두 페이즈 연속 실행

## 6. 미해결/리스크

- 서브에이전트(qa-tester)에서 claude-in-chrome MCP 도구 사용은 세션 연결 상태에 의존한다.
  헤드리스/원격 환경에서는 브라우저 검증이 불가능할 수 있으며, 이 경우 폴백 규칙(조건부 통과)을 따른다.
- 리뷰 루프 2회·QA 재검증 1회 상한은 초기값이다. 운영해 보고 사이클 비용 대비 조정한다.
- 한 사이클의 적정 규모(너무 큰 주제는 분할)는 PM 프롬프트의 판단 기준으로 명시하되,
  실제 운영에서 보정이 필요할 수 있다.
