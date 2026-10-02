import React from 'react';

export type IconName =
  | 'map'
  | 'heart'
  | 'plus'
  | 'collection'
  | 'profile'
  | 'restaurant'
  | 'coffee'
  | 'bar'
  | 'hotel'
  | 'culture'
  | 'entertainment'
  | 'shop'
  | 'park'
  | 'route'
  | 'search'
  | 'chevron'
  | 'location'
  | 'bookmark'
  | 'shield'
  | 'sparkles';

type Props = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function SpotIcon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className
}: Props) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
    >
      {name === 'map' ? (
        <>
          <path {...common} d="M9 18 3.8 20.2A1 1 0 0 1 2.5 19.3V6.6a1 1 0 0 1 .6-.9L9 3.2m0 14.8 6-3m-6 3V3.2m6 11.8 5.2 2.2a1 1 0 0 0 1.3-.9V3.6a1 1 0 0 0-1.4-.9L15 5m0 10V5m0 0L9 3.2" />
        </>
      ) : null}
      {name === 'heart' ? (
        <path {...common} d="M20.8 4.9a5.5 5.5 0 0 0-7.8 0L12 5.9l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.5l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z" />
      ) : null}
      {name === 'plus' ? (
        <>
          <path {...common} d="M12 5v14" />
          <path {...common} d="M5 12h14" />
        </>
      ) : null}
      {name === 'collection' ? (
        <>
          <rect {...common} x="3.5" y="4" width="7" height="7" rx="2" />
          <rect {...common} x="13.5" y="4" width="7" height="7" rx="2" />
          <rect {...common} x="3.5" y="14" width="7" height="6" rx="2" />
          <rect {...common} x="13.5" y="14" width="7" height="6" rx="2" />
        </>
      ) : null}
      {name === 'profile' ? (
        <>
          <circle {...common} cx="12" cy="8.2" r="3.2" />
          <path {...common} d="M5.4 20c.7-4 3.1-6 6.6-6s5.9 2 6.6 6" />
        </>
      ) : null}
      {name === 'restaurant' ? (
        <>
          <path {...common} d="M6 3v7M3.8 3v5.2A1.8 1.8 0 0 0 5.6 10h.8a1.8 1.8 0 0 0 1.8-1.8V3M6 10v11" />
          <path {...common} d="M15.5 3v18M15.5 3c3.3 1.6 4.7 4.7 3.8 8.2h-3.8" />
        </>
      ) : null}
      {name === 'coffee' ? (
        <>
          <path {...common} d="M4 8.5h12v5.2A5.3 5.3 0 0 1 10.7 19H9.3A5.3 5.3 0 0 1 4 13.7V8.5Z" />
          <path {...common} d="M16 10h1.5a2.5 2.5 0 1 1 0 5H16" />
          <path {...common} d="M8 5.5c-1-1 .2-1.8.2-2.8M12 5.5c-1-1 .2-1.8.2-2.8" />
        </>
      ) : null}
      {name === 'bar' ? (
        <>
          <path {...common} d="M4 4h16l-6.3 7.5v6.3" />
          <path {...common} d="M10.3 17.8h6.8M8.5 9h7" />
        </>
      ) : null}
      {name === 'hotel' ? (
        <>
          <path {...common} d="M4 20V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15M16 9h2a2 2 0 0 1 2 2v9M7.5 7h1M11.5 7h1M7.5 11h1M11.5 11h1M7.5 15h1M11.5 15h1M2.5 20h19" />
        </>
      ) : null}
      {name === 'culture' ? (
        <>
          <path {...common} d="m3 9 9-5 9 5M4.5 9h15M6 9v8M10 9v8M14 9v8M18 9v8M4 17h16M3 20h18" />
        </>
      ) : null}
      {name === 'entertainment' ? (
        <>
          <path {...common} d="M4 7.5h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4v-4Z" />
          <path {...common} d="M9 8v11M15 8v11" />
        </>
      ) : null}
      {name === 'shop' ? (
        <>
          <path {...common} d="M5 8h14l-1 12H6L5 8Z" />
          <path {...common} d="M9 9V6a3 3 0 0 1 6 0v3" />
        </>
      ) : null}
      {name === 'park' ? (
        <>
          <path {...common} d="M12 3c-3.2 2-5 4.4-5 7a5 5 0 0 0 10 0c0-2.6-1.8-5-5-7Z" />
          <path {...common} d="M12 10v11M8 21h8" />
        </>
      ) : null}
      {name === 'route' ? (
        <>
          <circle {...common} cx="6" cy="18" r="2" />
          <circle {...common} cx="18" cy="6" r="2" />
          <path {...common} d="M7.8 17c2.4-1.1 2-3.4 4.3-4.4 1.5-.7 2.9-.3 4-1.3 1.1-1 1-2.3 1-3.2" />
        </>
      ) : null}
      {name === 'search' ? (
        <>
          <circle {...common} cx="10.5" cy="10.5" r="5.5" />
          <path {...common} d="m15 15 5 5" />
        </>
      ) : null}
      {name === 'chevron' ? (
        <path {...common} d="m9 5 7 7-7 7" />
      ) : null}
      {name === 'location' ? (
        <>
          <path {...common} d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11Z" />
          <circle {...common} cx="12" cy="10" r="2" />
        </>
      ) : null}
      {name === 'bookmark' ? (
        <path {...common} d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.4L6 21V4.5Z" />
      ) : null}
      {name === 'shield' ? (
        <path {...common} d="M12 3 19 6v5.2c0 4.7-2.7 7.7-7 9.8-4.3-2.1-7-5.1-7-9.8V6l7-3Z" />
      ) : null}
      {name === 'sparkles' ? (
        <>
          <path {...common} d="m12 3 1.2 3.1L16 7.3l-2.8 1.2L12 12l-1.2-3.5L8 7.3l2.8-1.2L12 3Z" />
          <path {...common} d="m18.5 13 .8 2 1.7.8-1.7.7-.8 2-.7-2-1.8-.7 1.8-.8.7-2Z" />
          <path {...common} d="m5 14 .7 1.8 1.8.7-1.8.8L5 19l-.8-1.7-1.7-.8 1.7-.7L5 14Z" />
        </>
      ) : null}
    </svg>
  );
}
