// 휴대폰 번호 정규화·검증 공용 유틸.
// 결제(이니시스 V2 customer.phoneNumber 필수)·프로필 저장·알림톡 발송에서 공통 사용한다.
// 저장/전송 형식은 하이픈 없는 숫자(예: 01012345678).

/** 하이픈·공백 등 숫자 외 문자를 제거해 숫자만 남긴다. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

/** 010/011/016/017/018/019로 시작하는 10~11자리 휴대폰 번호만 허용. */
export function isValidPhone(digits: string): boolean {
  return /^01[016789][0-9]{7,8}$/.test(digits);
}

/** 저장된 숫자열을 하이픈 표기로 변환(표시용). 형식이 아니면 원본 반환. */
export function formatPhone(digits: string): string {
  const d = normalizePhone(digits);
  if (/^01[016789][0-9]{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^01[016789][0-9]{7}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return digits;
}
