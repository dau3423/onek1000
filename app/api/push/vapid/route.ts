// 클라이언트가 SW 구독 시 사용할 공개 VAPID 키 반환
import { NextResponse } from 'next/server';

export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  return NextResponse.json({ publicKey: key });
}
