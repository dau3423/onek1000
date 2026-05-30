// 한국어 닉네임 생성/검증 유틸 (순수 함수, 외부 의존 없음)
// "형용사 + 명사(+숫자)" 형태의 주유/절약 테마 닉네임을 만든다.
// 예: "알뜰한기름요정", "부지런한주유왕42"

/** 닉네임 형식 제약 */
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 10;

/** 절약/부지런함 톤의 형용사 */
const ADJECTIVES = [
  '알뜰한', '부지런한', '슬기로운', '현명한', '발빠른', '꼼꼼한', '재빠른',
  '센스있는', '눈썰미좋은', '검소한', '실속있는', '날렵한', '똑똑한', '용감한',
  '느긋한', '상냥한', '든든한', '활기찬', '명랑한', '소문난', '믿음직한', '싹싹한',
];

/** 주유/자동차/연료 테마의 명사 */
const NOUNS = [
  '기름요정', '주유왕', '연비지킴이', '셀프달인', '경유러', '휘발유러', '주유러',
  '기름탐험가', '최저가헌터', '주유고수', '연료박사', '드라이버', '라이더', '주유천재',
  '기름값파수꾼', '주유마스터', '연비요정', '기름선생', '주유대장', '절약왕', '한방울지킴이',
];

/** 0~9999 정수 → 한국어 닉네임용 숫자 접미 문자열 */
function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(arr.length)];
}

/**
 * "형용사 + 명사" base 1개 생성. 항상 NICKNAME_MAX 이하가 되도록,
 * 길이를 넘는 조합은 여러 번 다시 뽑는다(사전상 7~11자가 섞여 있어 잘림을 피함).
 * 숫자 접미 여유(reserve)를 주면 base 길이를 그만큼 줄여 접미 후에도 잘리지 않게 한다.
 */
function generateBase(reserve = 0): string {
  const limit = NICKNAME_MAX - reserve;
  for (let i = 0; i < 30; i++) {
    const base = `${pick(ADJECTIVES)}${pick(NOUNS)}`;
    if (base.length <= limit) return base;
  }
  // 극히 드문 경우의 안전망: 짧은 조합을 강제 선택(가장 짧은 형용사/명사)
  const shortAdj = ADJECTIVES.reduce((a, b) => (b.length < a.length ? b : a));
  const shortNoun = NOUNS.reduce((a, b) => (b.length < a.length ? b : a));
  return `${shortAdj}${shortNoun}`.slice(0, Math.max(NICKNAME_MIN, limit));
}

/**
 * 닉네임 후보 1개 생성. 결과는 항상 NICKNAME_MAX(10자) 이하.
 * @param withNumber true면 숫자 접미(1~3자리)를 붙여 충돌 회피 확률을 높인다.
 *   접미 자릿수만큼 base 길이를 미리 줄여 두므로 최종 결과는 절대 잘리지 않는다.
 */
export function generateNickname(withNumber = false): string {
  if (!withNumber) return generateBase();
  // 숫자 접미 최대 3자리(1~999) → base에 3자리 여유 확보
  const base = generateBase(3);
  const room = NICKNAME_MAX - base.length; // 1~3
  const maxNum = Math.pow(10, room) - 1; // room=3 → 999
  const n = randInt(maxNum) + 1; // 1~maxNum
  return `${base}${n}`;
}

/**
 * 닉네임 후보 목록 생성. 초반 몇 개는 숫자 없이, 이후에는 숫자를 붙인다.
 * 첫 로그인 시 DB 유니크 확보용으로 순차 시도한다.
 */
export function generateNicknameCandidates(count = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(generateNickname(i >= 2)); // 처음 2개만 숫자 없이 시도
  }
  return out;
}

/**
 * 비교/유니크 판정용 정규화 키.
 * 모든 공백 제거 + 소문자화(영문 혼용 대비). 한국어는 소문자 영향 없음.
 */
export function normalizeNickname(raw: string): string {
  return raw.replace(/\s+/g, '').toLowerCase();
}

export interface NicknameValidation {
  ok: boolean;
  /** 트리밍/정규화된 표시용 값(공백은 단일 공백으로 축약) */
  value: string;
  error?: string;
}

/**
 * 사용자 입력 닉네임 형식 검증.
 * - 길이 2~20자(트리밍 기준)
 * - 한글/영문/숫자/내부 공백만 허용(특수문자 금지)
 */
export function validateNickname(raw: string): NicknameValidation {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < NICKNAME_MIN) {
    return { ok: false, value: trimmed, error: `닉네임은 ${NICKNAME_MIN}자 이상이어야 해요.` };
  }
  if (trimmed.length > NICKNAME_MAX) {
    return { ok: false, value: trimmed, error: `닉네임은 ${NICKNAME_MAX}자 이하여야 해요.` };
  }
  // 한글(완성형/자모), 영문, 숫자, 공백만 허용
  if (!/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 ]+$/.test(trimmed)) {
    return { ok: false, value: trimmed, error: '닉네임에는 한글·영문·숫자만 사용할 수 있어요.' };
  }
  return { ok: true, value: trimmed };
}
