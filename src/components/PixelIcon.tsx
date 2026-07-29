import type { CSSProperties, ReactNode } from "react";

export type HarborIconName =
  | "anchor"
  | "arrowRight"
  | "baitLure"
  | "baitShrimp"
  | "baitWorm"
  | "boat"
  | "book"
  | "check"
  | "clock"
  | "close"
  | "coin"
  | "cooler"
  | "fish"
  | "harbor"
  | "hook"
  | "lock"
  | "map"
  | "pause"
  | "play"
  | "plus"
  | "rain"
  | "reel"
  | "rod"
  | "settings"
  | "soundOff"
  | "soundOn"
  | "sparkle"
  | "star"
  | "sun"
  | "wind";

export interface HarborIconProps {
  name: HarborIconName;
  size?: number;
  label?: string;
  className?: string;
}

const ICONS: Record<HarborIconName, ReactNode> = {
  anchor: (
    <>
      <circle cx="12" cy="5.2" r="2.5" />
      <path d="M12 7.8v11.7M7.2 11.2H16.8M4 15.2c.7 4.2 3.3 6.2 8 6.2s7.3-2 8-6.2M4 15.2l-1.6 2.3M20 15.2l1.6 2.3" />
    </>
  ),
  arrowRight: <path d="M4 12h15M14 6l6 6-6 6" />,
  baitLure: (
    <>
      <path d="M5 8.2c2.4-2.8 8.3-3.5 12.4-.2-2.2 3.1-7.9 4.5-12.4.2Z" />
      <path d="m17.4 8 3.4-2.2-.8 4.1-2.6-1.9ZM8.4 11.4l.5 4.2M8.9 15.6c0 2.2 3 2.3 3.2.2" />
    </>
  ),
  baitShrimp: (
    <>
      <path d="M18.7 7.2c-2.3-3.3-7.7-3.7-10.4-.7-2.5 2.8-1.6 7.7 2.5 9.3 3.6 1.4 7.5-.7 7.5-4 0-2.3-1.7-3.7-4-3.7-2.1 0-3.7 1.1-4.5 2.8" />
      <path d="M6.5 15.1 3.3 18M8.8 16.4 7 20M18.5 7.4 22 5.5M18.8 8.8l3.7.4" />
      <circle cx="15.7" cy="6.6" r=".8" fill="currentColor" stroke="none" />
    </>
  ),
  baitWorm: (
    <path d="M4 15.8c0-3 2.3-5.2 5.2-5.2h5.5c2.8 0 5.3-1.8 5.3-4.5 0-2-1.5-3.5-3.6-3.5-2.2 0-3.7 1.4-3.7 3.4v12.5c0 1.7-1.3 2.9-3.1 2.9-1.9 0-3.3-1.2-3.3-3" />
  ),
  boat: (
    <>
      <path d="M3 13.2h18l-2.5 6.1H6L3 13.2Z" />
      <path d="M7.3 13.2V7.8h8.2v5.4M11.4 7.8V3.3l5.5 4.5" />
      <path d="M2.3 21.2c2.1-1.4 4.3-1.4 6.4 0 2.1 1.4 4.3 1.4 6.4 0 2.1-1.4 4.3-1.4 6.4 0" />
    </>
  ),
  book: (
    <>
      <path d="M3.5 5.2c3.1-1.2 5.9-.7 8.5 1.4v14.1c-2.6-2.1-5.4-2.6-8.5-1.4V5.2ZM20.5 5.2c-3.1-1.2-5.9-.7-8.5 1.4v14.1c2.6-2.1 5.4-2.6 8.5-1.4V5.2Z" />
      <path d="M6.2 9h2.9M6.2 12h2.9M14.9 9h2.9M14.9 12h2.9" />
    </>
  ),
  check: <path d="m4 12.5 5 5L20 6.8" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.7v5.7l3.8 2.3" />
    </>
  ),
  close: <path d="m5 5 14 14M19 5 5 19" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.8 8.7h6.7M8.5 12h7M10 15.3h4M12 7v10" />
    </>
  ),
  cooler: (
    <>
      <path d="M3.3 8.2h17.4v11.3H3.3V8.2ZM4.8 4.5h14.4l1.5 3.7H3.3l1.5-3.7Z" />
      <path d="M8 4.5V2.8h8v1.7M15.8 11.2v4.9" />
    </>
  ),
  fish: (
    <>
      <path d="M3.2 12c3.3-4.4 9.5-6.3 14.2-2.7L22 6.4v11.2l-4.6-2.9C12.7 18.3 6.5 16.4 3.2 12Z" />
      <circle cx="8.5" cy="10.8" r=".8" fill="currentColor" stroke="none" />
      <path d="M13.2 8.3 15 5.8M13.4 15.7l1.8 2.5" />
    </>
  ),
  harbor: (
    <>
      <path d="M3 21V9.5L12 4l9 5.5V21M7 21v-7h10v7M9 10h6" />
      <path d="M1.8 21h20.4M4.7 6.7V3.2h4.7v.7M19.3 6.7V3.2h-4.7v.7" />
    </>
  ),
  hook: <path d="M13 2.5v11.2c0 4.1-2 6.8-5.2 6.8-3.1 0-5.3-2.2-5.3-5.1 0-2.5 1.7-4.4 4.1-4.7M9.5 4.5H16" />,
  lock: (
    <>
      <path d="M5 10h14v11H5V10ZM8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v3.2" />
    </>
  ),
  map: (
    <>
      <path d="m3 5 5-2 8 2 5-2v16l-5 2-8-2-5 2V5Z" />
      <path d="M8 3v16M16 5v16" />
    </>
  ),
  pause: <path d="M7 4v16M17 4v16" />,
  play: <path d="m7 4 12 8L7 20V4Z" />,
  plus: <path d="M12 4v16M4 12h16" />,
  rain: (
    <>
      <path d="M6 15h11.5a4 4 0 0 0 .4-8A6.2 6.2 0 0 0 6.2 8.8 3.1 3.1 0 0 0 6 15Z" />
      <path d="m7 18-1 2.5M12 18l-1 2.5M17 18l-1 2.5" />
    </>
  ),
  reel: (
    <>
      <circle cx="10.2" cy="12.2" r="6.3" />
      <circle cx="10.2" cy="12.2" r="2.3" />
      <path d="M15.6 9h4.2v4h-3.3M19.8 11h2M9.5 5.9l2-3.2h3.1" />
    </>
  ),
  rod: (
    <>
      <path d="m4 21 2.5-5.2C10.4 8 14.3 4.1 21 2.8" />
      <path d="M7.2 14.5 10 16l-2.8 5H3.5l3.7-6.5ZM14.7 6.2c4.6 2.7 5.8 7.2 5.7 11.7" />
      <circle cx="20.3" cy="19.3" r="1.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="m10 2.8.7 2.2a7.1 7.1 0 0 1 2.6 0l.7-2.2 3.4 1.4-1 2.1a7.4 7.4 0 0 1 1.8 1.8l2.1-1 1.4 3.4-2.2.7a7.1 7.1 0 0 1 0 2.6l2.2.7-1.4 3.4-2.1-1a7.4 7.4 0 0 1-1.8 1.8l1 2.1-3.4 1.4-.7-2.2a7.1 7.1 0 0 1-2.6 0l-.7 2.2-3.4-1.4 1-2.1a7.4 7.4 0 0 1-1.8-1.8l-2.1 1-1.4-3.4 2.2-.7a7.1 7.1 0 0 1 0-2.6l-2.2-.7 1.4-3.4 2.1 1a7.4 7.4 0 0 1 1.8-1.8l-1-2.1L10 2.8Z" />
    </>
  ),
  soundOff: (
    <>
      <path d="M3.5 9h4l5-4v14l-5-4h-4V9Z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </>
  ),
  soundOn: (
    <>
      <path d="M3.5 9h4l5-4v14l-5-4h-4V9Z" />
      <path d="M16 8.2a5 5 0 0 1 0 7.6M18.7 5.8a8.2 8.2 0 0 1 0 12.4" />
    </>
  ),
  sparkle: <path d="M12 2.5c.8 5.3 2.2 8.7 7.5 9.5-5.3.8-6.7 4.2-7.5 9.5-.8-5.3-2.2-8.7-7.5-9.5 5.3-.8 6.7-4.2 7.5-9.5Z" />,
  star: <path d="m12 2.8 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-3-5.6 3 1-6.2-4.5-4.4 6.3-.9L12 2.8Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.3" />
      <path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" />
    </>
  ),
  wind: (
    <path d="M3 8h12.5c2.1 0 3.1-1 3.1-2.4 0-1.2-.9-2.2-2.1-2.2-1.1 0-1.9.6-2.2 1.6M3 12h17.2M3 16h11.8c1.8 0 2.8.9 2.8 2.2 0 1.2-.9 2.2-2.2 2.2-1.1 0-1.8-.6-2.1-1.5" />
  ),
};

export function HarborIcon({
  name,
  size = 24,
  label,
  className,
}: HarborIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
    >
      {label ? <title>{label}</title> : null}
      {ICONS[name]}
    </svg>
  );
}

export interface FishIconProps {
  frame: number;
  name: string;
  size?: number;
  className?: string;
}

export function FishIcon({
  frame,
  name,
  size = 72,
  className,
}: FishIconProps) {
  const safeFrame = Math.min(5, Math.max(0, Math.floor(frame)));
  const column = safeFrame % 3;
  const row = Math.floor(safeFrame / 3);
  const style: CSSProperties = {
    width: size,
    height: size,
    flex: `0 0 ${size}px`,
    backgroundImage: 'url("/assets/game/fish-atlas.png")',
    backgroundPosition: `${column * 50}% ${row * 100}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "300% 200%",
  };

  return (
    <span
      className={["fish-icon", className].filter(Boolean).join(" ")}
      style={style}
      role="img"
      aria-label={name}
    />
  );
}
