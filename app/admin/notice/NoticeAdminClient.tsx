'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NOTICE_IMAGE_ACCEPT, NOTICE_IMAGE_BYTE_MAX } from '@/types/notice';

interface CurrentNotice {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  isActive: boolean;
}

interface Props {
  current: CurrentNotice | null;
}

/**
 * 공지 팝업 관리 폼(운영자용).
 *  - 이미지 선택(미리보기) + 링크 URL 입력 → 등록(POST /api/admin/notice, multipart).
 *  - 현재 활성 공지가 있으면 미리보기 + "노출 중단"(DELETE) 제공.
 *  - 등록/중단 후 router.refresh()로 서버 컴포넌트(현재 공지)를 재조회한다.
 */
export function NoticeAdminClient({ current }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setMsg(null);
    if (!f) {
      setPreview(null);
      return;
    }
    if (!(NOTICE_IMAGE_ACCEPT as readonly string[]).includes(f.type)) {
      setMsg({ kind: 'err', text: `지원하지 않는 형식입니다(${f.type}). JPG/PNG/WebP/GIF만 가능.` });
      e.target.value = '';
      setPreview(null);
      return;
    }
    if (f.size > NOTICE_IMAGE_BYTE_MAX) {
      setMsg({ kind: 'err', text: `파일이 너무 큽니다(${(f.size / 1024 / 1024).toFixed(1)}MB). 최대 5MB.` });
      e.target.value = '';
      setPreview(null);
      return;
    }
    setPreview(URL.createObjectURL(f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) {
      setMsg({ kind: 'err', text: '공지 이미지를 선택하세요.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('image', f);
      if (linkUrl.trim()) fd.append('linkUrl', linkUrl.trim());
      const r = await fetch('/api/admin/notice', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `등록 실패 (${r.status})`);
      setMsg({ kind: 'ok', text: '공지가 등록되었습니다. 첫 화면 팝업에 노출됩니다.' });
      setPreview(null);
      setLinkUrl('');
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(active: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/notice', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `변경 실패 (${r.status})`);
      setMsg({
        kind: 'ok',
        text: active ? '공지를 켰습니다. 첫 화면에 노출됩니다.' : '공지를 껐습니다. 더 이상 노출되지 않습니다.',
      });
      router.refresh();
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    // 관리 도구는 가독성 우선 — 라이트 배경+진한 글자로 고정.
    <main
      className="mx-auto min-h-dvh max-w-2xl bg-gray-50 px-4 py-8 text-gray-900"
      style={{ colorScheme: 'light' }}
    >
      <header className="mb-6">
        <p className="text-xs font-medium text-gray-500">운영자용 · 첫 화면 공지 팝업</p>
        <h1 className="mt-1 text-xl font-extrabold text-gray-900">📢 공지 팝업 관리</h1>
        <p className="mt-1 text-xs text-gray-500">
          이미지를 올리면 앱 첫 화면 진입 시 팝업으로 노출됩니다(단일 활성 공지). 링크를 넣으면
          이미지를 터치할 때 해당 주소로 이동합니다.
        </p>
      </header>

      {/* 현재 공지 + 노출 on/off 토글 */}
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold text-gray-700">현재 공지</h2>
        {current ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.imageUrl}
              alt="현재 공지"
              className={`h-28 w-28 rounded-lg border border-gray-200 object-cover ${
                current.isActive ? '' : 'opacity-50'
              }`}
            />
            <div className="min-w-0 flex-1">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                  current.isActive
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {current.isActive ? '● 노출 중' : '○ 꺼짐'}
              </span>
              <p className="mt-2 break-all text-xs text-gray-500">
                링크: {current.linkUrl ? current.linkUrl : '(없음)'}
              </p>
              {current.isActive ? (
                <button
                  type="button"
                  onClick={() => onToggle(false)}
                  disabled={busy}
                  className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
                >
                  공지 끄기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onToggle(true)}
                  disabled={busy}
                  className="mt-3 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white transition hover:bg-primary-dark disabled:opacity-50"
                >
                  공지 켜기
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-gray-500">등록된 공지가 없습니다.</p>
        )}
      </section>

      {/* 새 공지 등록 */}
      <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-gray-700">새 공지 등록</h2>

        <label className="mb-1.5 block text-xs font-medium text-gray-600">공지 이미지</label>
        <input
          ref={fileRef}
          type="file"
          accept={NOTICE_IMAGE_ACCEPT.join(',')}
          onChange={onPick}
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
        />
        <p className="mt-1 text-[11px] text-gray-400">JPG/PNG/WebP/GIF · 최대 5MB</p>

        {preview && (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="미리보기"
              className="max-h-64 w-auto rounded-lg border border-gray-200"
            />
          </div>
        )}

        <label className="mb-1.5 mt-4 block text-xs font-medium text-gray-600">
          연결 링크 URL (선택)
        </label>
        <input
          type="text"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://example.com 또는 /pricing"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-gray-400">
          http(s) 주소 또는 앱 내부 경로(/로 시작). 비우면 단순 공지(이동 없음).
        </p>

        {msg && (
          <p
            className={`mt-3 text-sm font-medium ${
              msg.kind === 'ok' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {msg.text}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
        >
          {busy ? '처리 중…' : '공지 등록'}
        </button>
      </form>
    </main>
  );
}
