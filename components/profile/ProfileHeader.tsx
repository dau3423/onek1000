'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { REVIEW_PHOTO_BYTE_MAX } from '@/types/review';
import { NICKNAME_MAX, NICKNAME_MIN, validateNickname } from '@/lib/nickname';

interface Props {
  /** 서버에서 조회한 현재 프로필 사진(없으면 세션/기본 아바타) */
  initialImage?: string | null;
  /** 서버에서 조회한 현재 닉네임(없으면 세션 폴백) */
  initialNickname?: string | null;
  /** 닉네임이 없을 때 표시할 폴백 이름(세션 name 등) */
  fallbackName?: string | null;
  /** 표시용 이메일 */
  email?: string | null;
}

/**
 * 마이페이지 상단 프로필 카드.
 * 아바타(사진 변경/기본으로) + 닉네임(인라인 변경) + 이메일을 한 카드에서 처리한다.
 * API 호출(`/api/profile`)과 세션 `update()` 흐름은 기존 AvatarEditor/NicknameEditor와 동일.
 */
export function ProfileHeader({ initialImage, initialNickname, fallbackName, email }: Props) {
  // 변경 저장 후 세션을 즉시 반영(헤더/마이페이지 표시 갱신)
  const { update } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);

  // 아바타 상태
  const [image, setImage] = useState<string | null>(initialImage ?? null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);

  // 닉네임 상태
  const [nickname, setNickname] = useState<string>(initialNickname ?? '');
  const [nicknameInput, setNicknameInput] = useState<string>(initialNickname ?? '');
  const [editing, setEditing] = useState(false);
  const [nickBusy, setNickBusy] = useState(false);
  const [nickErr, setNickErr] = useState<string | null>(null);

  // 초기 닉네임이 없으면(기존 사용자 폴백) 서버에서 한 번 조회
  useEffect(() => {
    if (initialNickname) return;
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.nickname === 'string') {
          setNickname(d.nickname);
          setNicknameInput(d.nickname);
        }
      })
      .catch(() => {});
  }, [initialNickname]);

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setAvatarErr('이미지 파일만 올릴 수 있어요.');
    if (file.size > REVIEW_PHOTO_BYTE_MAX) return setAvatarErr('사진 용량은 5MB 이하만 가능해요.');

    setAvatarErr(null);
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await fetch('/api/profile', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '업로드에 실패했어요.');
      setImage(d.image ?? null);
      await update(); // 세션 갱신 → 헤더/표시 즉시 반영
    } catch (e2) {
      setAvatarErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setAvatarBusy(false);
    }
  };

  const resetAvatar = async () => {
    setAvatarErr(null);
    setAvatarBusy(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetImage: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '변경에 실패했어요.');
      setImage(d.image ?? null);
      await update();
    } catch (e2) {
      setAvatarErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveNickname = async () => {
    setNickErr(null);
    const v = validateNickname(nicknameInput);
    if (!v.ok) return setNickErr(v.error ?? '닉네임을 확인해 주세요.');
    if (v.value === nickname) {
      setEditing(false);
      return;
    }
    setNickBusy(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: v.value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '변경에 실패했어요.');
      setNickname(d.nickname);
      setNicknameInput(d.nickname);
      setEditing(false);
      await update(); // 세션 갱신 → 헤더/표시 즉시 반영
    } catch (e) {
      setNickErr(e instanceof Error ? e.message : String(e));
    } finally {
      setNickBusy(false);
    }
  };

  const cancelNickname = () => {
    setNicknameInput(nickname);
    setEditing(false);
    setNickErr(null);
  };

  const displayName = nickname || fallbackName || '회원';
  const initial = displayName.trim()?.[0] ?? '·';

  return (
    <div>
      <div className="flex items-start gap-4">
        {/* 아바타 */}
        <div className="relative h-16 w-16 shrink-0">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="프로필 사진" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl font-bold text-gray-500">
              {initial}
            </div>
          )}
        </div>

        {/* 이름 / 이메일 / 사진 버튼 */}
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <label className="text-xs text-gray-500" htmlFor="nickname-input">
                새 닉네임 ({NICKNAME_MIN}~{NICKNAME_MAX}자, 한글·영문·숫자)
              </label>
              <input
                id="nickname-input"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                maxLength={NICKNAME_MAX}
                placeholder="닉네임"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary"
              />
              {nickErr && <p className="text-xs text-red-500">{nickErr}</p>}
              <div className="flex gap-2">
                <button
                  onClick={saveNickname}
                  disabled={nickBusy}
                  className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {nickBusy ? '저장 중…' : '저장'}
                </button>
                <button
                  onClick={cancelNickname}
                  disabled={nickBusy}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 disabled:opacity-60"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="truncate font-bold text-gray-900">{displayName}</span>
                <button
                  onClick={() => {
                    setNickErr(null);
                    setEditing(true);
                  }}
                  className="shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  변경
                </button>
              </div>
              {email && <div className="mt-0.5 truncate text-xs text-gray-500">{email}</div>}

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarBusy}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  {avatarBusy ? '처리 중…' : '사진 변경'}
                </button>
                {image && (
                  <button
                    onClick={resetAvatar}
                    disabled={avatarBusy}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 disabled:opacity-60"
                  >
                    기본으로
                  </button>
                )}
              </div>
              {avatarErr && <p className="mt-1.5 text-xs text-red-500">{avatarErr}</p>}
            </>
          )}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} className="hidden" />
    </div>
  );
}
