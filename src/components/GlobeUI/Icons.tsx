import { useId, type ReactNode, type SVGProps } from 'react';

import type { WeatherKind } from '../../utils/format';

// 직접 그린 아이콘 모음 (Globe View 2D 앱과 같은 아이콘) (모두 24×24 크기의 SVG)
// stroke="currentColor"라서 글자색(흰색)을 그대로 따라갑니다.

const base: SVGProps<SVGSVGElement> = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export type IconName =
  | 'search' | 'close' | 'settings' | 'about' | 'plus' | 'minus' | 'locate' | 'radar' | 'wind' | 'heat'
  | 'more' | 'distance' | 'area' | 'satellite' | 'precipitation' | 'temperature' | 'humidity' | 'pressure'
  | 'check' | 'chevronUp' | 'chevronDown' | 'play' | 'pause' | 'recent' | 'star' | 'share' | 'layers';

const paths: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  close: <path d="M7 7l10 10M17 7L7 17" />,
  settings: (
    <>
      {/* 톱니바퀴: 바깥 톱니 + 가운데 구멍 */}
      <path
        d="M10.5 2h3l.5 2.6c.7.2 1.3.5 1.9.8l2.2-1.5 2.1 2.1-1.5 2.2c.3.6.6 1.2.8 1.9l2.5.4v3l-2.6.5c-.2.7-.5 1.3-.8 1.9l1.5 2.2-2.1 2.1-2.2-1.5c-.6.3-1.2.6-1.9.8l-.4 2.5h-3l-.5-2.6c-.7-.2-1.3-.5-1.9-.8l-2.2 1.5-2.1-2.1 1.5-2.2c-.3-.6-.6-1.2-.8-1.9L2 13.5v-3l2.6-.5c.2-.7.5-1.3.8-1.9L3.9 5.9 6 3.8l2.2 1.5c.6-.3 1.2-.6 1.9-.8z"
        fill="currentColor"
        stroke="none"
      />
      <circle cx="12" cy="12" r="3.4" fill="#1b232c" stroke="none" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" />
      <path d="M12 11v6" stroke="#1b232c" strokeWidth="2.4" />
      <circle cx="12" cy="7.6" r="1.4" fill="#1b232c" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  locate: <path d="M20 4L4 11l7 2 2 7 7-16z" fill="currentColor" strokeWidth="1.2" />,
  radar: (
    <>
      <path d="M5 19A10 10 0 0 1 19 5" />
      <path d="M8.5 15.5a5 5 0 0 1 7-7" />
      <path d="M12 12l6.5 6.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12h15a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 16h8" />
    </>
  ),
  heat: (
    <path
      d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.2 1.6 1 2.6 2 3 0-3 0-5.5.8-8.2z"
      fill="currentColor"
      strokeWidth="1"
    />
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="18" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  distance: (
    <>
      <path d="M6 18L18 6" />
      <circle cx="5" cy="19" r="2" fill="currentColor" />
      <circle cx="19" cy="5" r="2" fill="currentColor" />
    </>
  ),
  area: (
    <>
      <path d="M5 5h14v14H5z" />
      <path d="M5 13l8-8M5 19L19 5M11 19l8-8" strokeWidth="1.4" />
    </>
  ),
  satellite: (
    <>
      <path d="M9 9l6 6" strokeWidth="5" />
      <path d="M4 4l4 4M16 16l4 4M3 9l3-3M15 21l3-3" />
      <path d="M17 3a4 4 0 0 1 4 4" strokeWidth="1.6" />
    </>
  ),
  precipitation: (
    <>
      <path d="M7 14a4 4 0 0 1 .5-8A5.5 5.5 0 0 1 18 7.5a3.3 3.3 0 0 1-.5 6.5z" fill="currentColor" strokeWidth="1" />
      <path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3" />
    </>
  ),
  temperature: (
    <>
      <path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" />
      <path d="M12 9v7" />
      <path d="M17 6h2M17 9h2" strokeWidth="1.4" />
    </>
  ),
  humidity: (
    <>
      <path d="M3 9c3-3 6 3 9 0s6 3 9 0" />
      <path d="M3 14c3-3 6 3 9 0s6 3 9 0" />
      <path d="M3 19c3-3 6 3 9 0" />
    </>
  ),
  pressure: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12l4-4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" strokeWidth="1" />,
  pause: <path d="M8 5v14M16 5v14" strokeWidth="3" />,
  recent: <path d="M6 5l9 7-9 7zM18 5v14" fill="currentColor" strokeWidth="1.4" />,
  star: <path d="M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z" strokeWidth="1.6" />,
  share: (
    <>
      <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" />
      <path d="M6 11H5v9h14v-9h-1" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" fill="currentColor" strokeWidth="1.4" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
};

export function Icon({ name, size = 24, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg {...base} width={size} height={size} className={`svg-icon ${className}`}>
      {paths[name]}
    </svg>
  );
}

// 날씨 상태 아이콘 (해, 구름, 비, 눈)
export function WeatherIcon({ kind }: { kind: WeatherKind }) {
  const sun = (
    <g>
      <circle cx="12" cy="12" r="4.2" fill="#ffd60a" />
      <path
        d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7"
        stroke="#ffd60a"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </g>
  );
  const cloud = (fill: string) => <path d="M7 19a4.2 4.2 0 0 1-.4-8.4A5.6 5.6 0 0 1 17.4 10 4.5 4.5 0 0 1 17 19z" fill={fill} />;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="weather-icon">
      {kind === 'sun' && sun}
      {kind === 'partly' && (
        <>
          <g transform="translate(4 -3) scale(0.8)">{sun}</g>
          <g transform="translate(-1 2) scale(0.85)">{cloud('#ffffff')}</g>
        </>
      )}
      {kind === 'cloud' && cloud('#d8dde4')}
      {kind === 'snow' && (
        <>
          <g transform="translate(0 -3)">{cloud('#9ecbff')}</g>
          <circle cx="8" cy="20" r="1.2" fill="#fff" />
          <circle cx="12" cy="21" r="1.2" fill="#fff" />
          <circle cx="16" cy="20" r="1.2" fill="#fff" />
        </>
      )}
      {kind === 'rain' && (
        <>
          <g transform="translate(0 -3)">{cloud('#9ecbff')}</g>
          <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="#57abff" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

// 앱 로고: 파란 원 안에 소용돌이 (직접 디자인한 대체 로고)
// 같은 로고가 여러 번 나와도 색(그라디언트)이 겹치지 않게 고유한 id를 씁니다
export function LogoMark({ size = 38 }: { size?: number }) {
  const gradientId = `logoSea-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" aria-hidden="true" className="logo-mark">
      <defs>
        <radialGradient id={gradientId} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#bfe8ff" />
          <stop offset="0.45" stopColor="#3aa6ff" />
          <stop offset="1" stopColor="#3b2fd6" />
        </radialGradient>
      </defs>
      <circle cx="38" cy="38" r="37" fill="#141a22" />
      <circle cx="38" cy="38" r="33" fill={`url(#${gradientId})`} />
      <path
        d="M38 18c-9 0-16 5-18.5 12 4.5-3.5 10-4.6 14.5-3.2A12 12 0 0 0 38 58c9 0 16-5 18.5-12-4.5 3.5-10 4.6-14.5 3.2A12 12 0 0 0 38 18z"
        fill="#ffffff"
        opacity="0.88"
      />
      <circle cx="38" cy="38" r="5.5" fill="#2f6df0" />
    </svg>
  );
}
