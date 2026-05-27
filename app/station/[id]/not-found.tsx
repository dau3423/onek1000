import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl">⛽</div>
      <h1 className="text-xl font-bold text-gray-900">주유소 정보를 찾을 수 없습니다</h1>
      <p className="text-sm text-gray-500">데이터가 갱신되며 사라졌을 수 있어요.</p>
      <Link href="/" className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white">
        지도로 돌아가기
      </Link>
    </main>
  );
}
