// 사업자 정보 (공개 정보 — 하드코딩). /legal/business 페이지와 홈 하단 푸터에서 공용 사용.
// 카드사 심사용 필수 표기 항목: 상호/대표자/사업장주소/사업자등록번호/대표전화/대표이메일.
export const BUSINESS_INFO = {
  name: '주니코드(Junicode)',
  owner: '박순복',
  address: '경기도 수원시 장안구 영화로 71번길',
  registrationNumber: '574-06-02215',
  ecommerceNumber: '제2025-수원장안-0459호',
  phone: '010-3401-5201',
  email: 'junicode0901@gmail.com',
} as const;
