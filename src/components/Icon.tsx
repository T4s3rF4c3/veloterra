import type { ReactNode } from 'react';

/**
 * Linien-Symbole der App – alle im selben Raster (24 px), gleiche Strichstärke
 * und runde Enden wie die Bereichsleiste. Ersetzt Emoji und Unicode-Zeichen.
 */
const PATHS = {
  // Bereiche
  route: (
    <>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8 17c4-1 2-6 6-7s3-2 3-2" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  bike: (
    <>
      <circle cx="6.5" cy="16.5" r="3.5" />
      <circle cx="17.5" cy="16.5" r="3.5" />
      <path d="M6.5 16.5 10 9h5l2.5 7.5M10 9 8.5 6.5H6.5M15 9l-3 7.5" />
    </>
  ),
  // Bedienung
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'arrow-right': <path d="M5 12h14m-6-6 6 6-6 6" />,
  'arrow-up': <path d="M12 19V5m-6 6 6-6 6 6" />,
  'arrow-down': <path d="M12 5v14m-6-6 6 6 6-6" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="m15 14 5-5-5-5m5 5H9.5a5.5 5.5 0 0 0 0 11H13" />,
  refresh: <path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5M20 3.5v5h-5" />,
  'rotate-ccw': <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 3.5v5h5" />,
  swap: <path d="M7 20V4M3 8l4-4 4 4M17 4v16m-4-4 4 4 4-4" />,
  backspace: <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7zm3 4 6 6m0-6-6 6" />,
  download: <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />,
  upload: <path d="M12 15V4M7 9l5-5 5 5M5 20h14" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zm9.5-13.5 4 4" />,
  layers: <path d="M12 3 2.5 8l9.5 5 9.5-5zM2.5 12.5l9.5 5 9.5-5M2.5 16.5l9.5 5 9.5-5" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <path d="M3 3l18 18M10.6 5.6A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.6 6.6C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.3-.5 4.6-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  ),
  sliders: (
    <>
      <path d="M4 7h10m4 0h2M4 17h2m4 0h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  alternative: <path d="M4 8h15m-3-3 3 3-3 3M20 16H5m3-3-3 3 3 3" />,
  detour: <path d="M3 17h4c2.5 0 2.5-9 5-9s2.5 9 5 9h4m-3-3 3 3-3 3" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </>
  ),
  stretch: <path d="M4 12h16M4 8v8m16-8v8" />,
  marquee: <rect x="3.5" y="6" width="17" height="12" rx="1.5" strokeDasharray="3 2.6" />,
  target: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  external: <path d="M14 4h6v6m0-6-9 9m7 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  // Inhalte
  wind: <path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" />,
  mountain: <path d="m2.5 19 7-12 4.5 7.5 2.5-3.5 5 8z" />,
  coffee: <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zm12 1h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3m4-3v3" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  flame: <path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7 10 6 12.5 6 15a6 6 0 0 0 6 6z" />,
  camera: (
    <>
      <path d="M3.5 8h3.5l2-3h6l2 3h3.5v11h-17z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="m3.5 16 5-5 4 4 2.5-2.5 5 5" />
      <circle cx="15.5" cy="9" r="1.5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M9.5 21v-5.5L8 14v-3.5A1.5 1.5 0 0 1 9.5 9h5a1.5 1.5 0 0 1 1.5 1.5V14l-1.5 1.5V21" />
    </>
  ),
  signpost: <path d="M12 3v18M5 5.5h11l3 2.5-3 2.5H5zm14 7H8l-3 2.5L8 17.5h11z" />,
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zm0 0v14m6-12v14" />,
  // Orte unterwegs und Ausflugsziele
  droplet: <path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z" />,
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-7.9 7.9l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a6 6 0 0 1 7.9-7.9z" />
  ),
  binoculars: (
    <>
      <circle cx="6.5" cy="15.5" r="3.5" />
      <circle cx="17.5" cy="15.5" r="3.5" />
      <path d="M3.5 13.5 6 6h3.5l1 6.5m3 0 1-6.5H18l2.5 7.5M10 15h4" />
    </>
  ),
  toilet: (
    <>
      <circle cx="7.5" cy="5" r="1.6" />
      <circle cx="16.5" cy="5" r="1.6" />
      <path d="M7.5 8.5V20M5 11h5M16.5 8.5 14 15h5l-2.5-6.5M15.5 15v5m2-5v5M12 4v16" />
    </>
  ),
  castle: <path d="M4 20V8h2.5v2.5H9V8h2.5v2.5h1V8H15v2.5h2.5V8H20v12zm6.5 0v-3.5a1.5 1.5 0 0 1 3 0V20" />,
  waves: (
    <path d="M3 8.5c2 0 2.2-1.5 4.5-1.5s2.5 1.5 4.5 1.5 2.2-1.5 4.5-1.5S19 8.5 21 8.5m-18 5c2 0 2.2-1.5 4.5-1.5s2.5 1.5 4.5 1.5 2.2-1.5 4.5-1.5 2.5 1.5 4.5 1.5m-18 5c2 0 2.2-1.5 4.5-1.5s2.5 1.5 4.5 1.5 2.2-1.5 4.5-1.5 2.5 1.5 4.5 1.5" />
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  circle: <circle cx="12" cy="12" r="6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
