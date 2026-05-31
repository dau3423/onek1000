import Link from 'next/link';
import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-primary hover:underline">
        ← 1000냥 주유소 홈으로
      </Link>
      <article className="mt-6 space-y-5 text-sm leading-relaxed text-gray-700 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-gray-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </article>
      <footer className="mt-12 flex gap-4 border-t border-gray-100 pt-6 text-xs text-gray-400">
        <Link href="/legal/terms" className="hover:underline">이용약관</Link>
        <Link href="/legal/privacy" className="hover:underline">개인정보처리방침</Link>
        <Link href="/legal/payment" className="hover:underline">유료 결제 이용약관</Link>
      </footer>
    </main>
  );
}
