// 트랜잭션 이메일 발송 — Resend REST API를 의존성 없이 fetch로 호출한다.
// 필요 env: RESEND_API_KEY(발급 키), RESET_FROM(인증된 발신 주소, 예: "1000냥 주유소 <help@onek1000.kr>").
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** 발송에 필요한 env가 모두 설정됐는지. 호출부에서 미설정을 구분(로깅·안내)하는 데 쓴다. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESET_FROM);
}

/**
 * 이메일 1건 발송. 성공 true / 실패 false(예외를 던지지 않아 호출 흐름을 깨지 않는다).
 * 실패해도 비밀번호 재설정 API는 사용자 열거 방지를 위해 동일 응답을 유지한다.
 */
export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESET_FROM;
  if (!apiKey || !from) {
    console.error('[email] RESEND_API_KEY/RESET_FROM 미설정 — 메일 발송 건너뜀');
    return false;
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
    });
    if (!res.ok) {
      console.error('[email] 발송 실패', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] 발송 예외', e);
    return false;
  }
}

/** 비밀번호 재설정 메일 본문(HTML). 단순·모바일 친화 인라인 스타일. */
export function passwordResetEmailHtml(resetUrl: string): string {
  return [
    '<div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#111827;">',
    '<h1 style="font-size:18px;font-weight:700;margin:0 0 12px;">비밀번호 재설정</h1>',
    '<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px;">아래 버튼을 눌러 새 비밀번호를 설정해 주세요. 이 링크는 <b>1시간</b> 동안만 유효합니다.</p>',
    `<a href="${resetUrl}" style="display:inline-block;background:#FF6B00;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:12px;">비밀번호 재설정하기</a>`,
    '<p style="font-size:12px;line-height:1.6;color:#6b7280;margin:20px 0 0;">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 비밀번호는 변경되지 않습니다.</p>',
    `<p style="font-size:12px;color:#9ca3af;margin:12px 0 0;word-break:break-all;">버튼이 안 되면 이 주소를 복사해 열어주세요:<br>${resetUrl}</p>`,
    '<p style="font-size:12px;color:#9ca3af;margin:16px 0 0;">— 1000냥 주유소</p>',
    '</div>',
  ].join('');
}
