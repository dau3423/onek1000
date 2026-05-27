'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="w-full rounded-lg border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
    >
      로그아웃
    </button>
  );
}
