/*
 * 공용 인라인 SVG 아이콘 세트 (의존성 없음).
 *
 * Icon paths adapted from Lucide (ISC) and Heroicons (MIT).
 *   - Lucide: https://lucide.dev — ISC License
 *   - Heroicons: https://heroicons.com — MIT License
 * path 데이터만 인라인 복사하므로 npm 의존성은 추가하지 않는다(package.json 불변).
 *
 * 규격
 *   - viewBox="0 0 24 24".
 *   - stroke형: fill="none" stroke="currentColor" strokeWidth 2, linecap/linejoin round.
 *   - fill형: fill="currentColor" stroke="none".
 *   - props는 { className? }만. 기본 className="h-5 w-5", 기본 aria-hidden.
 *   - 색은 SVG 내부에 하드코딩하지 않는다 — 항상 currentColor(부모 text-* 클래스로 제어).
 *   - 'use client' 없음 — 순수 SVG 함수 컴포넌트라 서버 컴포넌트에서도 import 가능.
 */
import type { ReactNode } from 'react';

interface IconProps {
  className?: string;
}

// stroke형 공통 래퍼 — 색/두께/캡을 단일 출처로 통일한다.
function Stroke({ className = 'h-5 w-5', children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// fill형 공통 래퍼 — 채움 아이콘(하트/별/왕관/스파클/번개 강조).
function Fill({ className = 'h-5 w-5', children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// === stroke형 ===

export function BackIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </Stroke>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Stroke>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="m9 18 6-6-6-6" />
    </Stroke>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </Stroke>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </Stroke>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Stroke>
  );
}

export function BoltIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Stroke>
  );
}

export function FuelIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <line x1="3" x2="15" y1="22" y2="22" />
      <line x1="4" x2="14" y1="9" y2="9" />
      <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
      <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
    </Stroke>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </Stroke>
  );
}

export function StarOutlineIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
    </Stroke>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Stroke>
  );
}

export function CarIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </Stroke>
  );
}

export function TrendUpIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </Stroke>
  );
}

export function ChartIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </Stroke>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </Stroke>
  );
}

export function BellOffIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
      <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <path d="m2 2 20 20" />
    </Stroke>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </Stroke>
  );
}

export function MailIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Stroke>
  );
}

export function SmartphoneIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </Stroke>
  );
}

export function CameraIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </Stroke>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.874a2 2 0 0 1 .506-.852z" />
    </Stroke>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Stroke>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </Stroke>
  );
}

export function XCircleIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </Stroke>
  );
}

export function GiftIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </Stroke>
  );
}

export function InstallIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </Stroke>
  );
}

export function RouteIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </Stroke>
  );
}

export function SparklesIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </Stroke>
  );
}

export function FullscreenIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </Stroke>
  );
}

export function FullscreenExitIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </Stroke>
  );
}

export function LocationOffIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12.75 7.09a3 3 0 0 1 2.16 2.16" />
      <path d="M17.072 17.072c-1.634 2.17-3.527 3.912-4.471 4.727a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 1.432-4.568" />
      <path d="M8.475 2.818A8 8 0 0 1 20 10c0 1.183-.31 2.377-.81 3.533" />
      <path d="m2 2 20 20" />
    </Stroke>
  );
}

export function LoaderIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Stroke>
  );
}

export function BuildingIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </Stroke>
  );
}

export function MapIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
      <path d="M15 5.764v15" />
      <path d="M9 3.236v15" />
    </Stroke>
  );
}

export function GlobeIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </Stroke>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Stroke>
  );
}

export function CelebrationIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M5.8 11.3 2 22l10.7-3.79" />
      <path d="M4 3h.01" />
      <path d="M22 8h.01" />
      <path d="M15 2h.01" />
      <path d="M22 20h.01" />
      <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L12 10" />
      <path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11-.11.7-.72 1.22-1.43 1.22H14" />
      <path d="M11 2 9.66 2.6a2.5 2.5 0 0 0-1.32 1.32L8 5" />
    </Stroke>
  );
}

export function CardIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </Stroke>
  );
}

export function CoinIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="m16.71 13.88.7.71-2.82 2.82" />
    </Stroke>
  );
}

export function DropletIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </Stroke>
  );
}

// 세차장 레이어 진입 칩 아이콘 — 부설 필터의 DropletIcon(물방울)과 반드시 형태가 달라야 한다.
// 차체 실루엣 + 위에서 내려오는 분사선 3줄(= 차를 씻는다)로 "독립 세차장"을 나타낸다.
/**
 * 주차장 — 라운드 사각 + 'P'.
 * 기존 아이콘 중 대체할 게 없다(CarIcon 은 렌터카, BuildingIcon 은 관리기관 표시에 쓰인다).
 * 'P' 는 획이 아니라 path 로 그린다 — Stroke 래퍼가 fill=none 이라 텍스트를 쓰면 안 보인다.
 */
export function ParkingIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      {/* P: 세로 기둥 + 위쪽 반원 */}
      <path d="M9.75 16.5V7.5h3.1a2.6 2.6 0 0 1 0 5.2H9.75" />
    </Stroke>
  );
}

export function CarwashIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      {/* 위에서 내려오는 물 분사선 3줄 */}
      <path d="M8 2.5v2.5" />
      <path d="M12 2v3" />
      <path d="M16 2.5v2.5" />
      {/* 차체 + 바퀴 */}
      <path d="M5.5 16l1-3.1A2 2 0 0 1 8.4 11.5h7.2a2 2 0 0 1 1.9 1.4L18.5 16" />
      <path d="M4 16h16" />
      <circle cx="8" cy="18.5" r="1.5" />
      <circle cx="16" cy="18.5" r="1.5" />
    </Stroke>
  );
}

// === fill형 ===

export function BoltFilledIcon({ className }: IconProps) {
  return (
    <Fill className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Fill>
  );
}

export function HeartFilledIcon({ className }: IconProps) {
  return (
    <Fill className={className}>
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0z" />
    </Fill>
  );
}

export function StarFilledIcon({ className }: IconProps) {
  return (
    <Fill className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006Z"
      />
    </Fill>
  );
}

export function CrownIcon({ className }: IconProps) {
  return (
    <Fill className={className}>
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <rect x="5" y="19" width="14" height="2" rx="1" />
    </Fill>
  );
}

export function SparkleIcon({ className }: IconProps) {
  return (
    <Fill className={className}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </Fill>
  );
}

// 정비소 레이어 칩 아이콘 — 세차장(CarwashIcon: 차+분사선)과 형태가 확실히 달라야 한다.
// 렌치(스패너) 한 자루로 "고친다"를 나타낸다.
export function WrenchIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M14.7 6.3a3.9 3.9 0 0 0 5.1 5.1l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a3.9 3.9 0 0 0-5.1-5.1l3 3-1.6 1.6-3-3a3.9 3.9 0 0 1 4.6-1.5" />
    </Stroke>
  );
}

// 비로그인 잠금 표시(LoginBlurGate) — 자물쇠. 잠긴 콘텐츠 위 오버레이 버튼에서만 쓴다.
export function LockIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Stroke>
  );
}

/**
 * TOP10 핀 반짝이 — React 컴포넌트가 아니라 KakaoMap 마커 빌더(HTML 문자열)에 삽입하는
 * SVG 마크업 문자열. 12px · fill="currentColor"라 감싸는 span의 CSS color를 상속한다.
 * (globals.css .top10-sparkle의 color/애니메이션을 그대로 재사용)
 */
export const SPARKLE_SVG_STRING =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="display:block" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>';
