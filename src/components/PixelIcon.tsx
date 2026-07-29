import type { CSSProperties, ReactNode } from "react";

import { PRODUCTS } from "../data/products";
import type { ProductId } from "../game/types";

export type PixelIconName =
  | "acorn"
  | "arrowRight"
  | "box"
  | "check"
  | "clock"
  | "close"
  | "coin"
  | "heart"
  | "minus"
  | "order"
  | "pause"
  | "play"
  | "plus"
  | "reset"
  | "restock"
  | "scanner"
  | "settings"
  | "shelf"
  | "soundOff"
  | "soundOn"
  | "speed"
  | "star"
  | "target"
  | "upgrade"
  | "warehouse";

export interface PixelIconProps {
  name: PixelIconName;
  size?: number;
  label?: string;
  className?: string;
}

const ICONS: Record<PixelIconName, ReactNode> = {
  acorn: (
    <>
      <path d="M7 8h10v3h2v5h-2v3H7v-3H5v-5h2z" fill="currentColor" />
      <path d="M8 5h9v3H8zM11 3h3v2h-3z" fill="currentColor" />
      <path d="M8 11h2v2H8z" fill="white" opacity=".55" />
    </>
  ),
  arrowRight: (
    <path
      d="M5 10h8V6h3v3h3v6h-3v3h-3v-4H5z"
      fill="currentColor"
    />
  ),
  box: (
    <>
      <path d="M4 7h16v13H4z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 7l4-4h8l4 4M12 7v13M8 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  check: (
    <path d="M4 11h4v4h3v3h3v-3h2v-3h2V8h-3v3h-2v3h-2v-3H8V9H4z" fill="currentColor" />
  ),
  clock: (
    <>
      <path d="M7 3h10v2h3v3h2v8h-2v3h-3v2H7v-2H4v-3H2V8h2V5h3z" fill="currentColor" />
      <path d="M8 6h8v2h2v8h-2v2H8v-2H6V8h2z" fill="white" opacity=".88" />
      <path d="M11 7h2v6h4v2h-6z" fill="currentColor" />
    </>
  ),
  close: (
    <path d="M5 4h4v4h2v2h2V8h2V4h4v5h-3v2h-2v2h2v2h3v5h-4v-4h-2v-2h-2v2H9v4H5v-5h3v-2h2v-2H8V9H5z" fill="currentColor" />
  ),
  coin: (
    <>
      <path d="M7 3h10v2h3v3h2v8h-2v3h-3v2H7v-2H4v-3H2V8h2V5h3z" fill="currentColor" />
      <path d="M8 6h8v2h2v8h-2v2H8v-2H6V8h2z" fill="#ffd45c" />
      <path d="M8 9h8v2h-3v2h3v2H8v-2h3v-2H8z" fill="currentColor" />
    </>
  ),
  heart: (
    <path d="M4 5h5v2h2v2h2V7h2V5h5v2h2v6h-2v3h-3v3h-3v3h-4v-3H7v-3H4v-3H2V7h2z" fill="currentColor" />
  ),
  minus: <path d="M4 10h16v4H4z" fill="currentColor" />,
  order: (
    <>
      <path d="M5 4h4V2h6v2h4v18H5z" fill="currentColor" />
      <path d="M8 7h8v2H8zm0 4h8v2H8zm0 4h6v2H8z" fill="white" opacity=".85" />
      <path d="M10 3h4v3h-4z" fill="white" opacity=".7" />
    </>
  ),
  pause: <path d="M5 4h5v16H5zm9 0h5v16h-5z" fill="currentColor" />,
  play: <path d="M6 3h4v3h4v3h4v6h-4v3h-4v3H6z" fill="currentColor" />,
  plus: <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" fill="currentColor" />,
  reset: (
    <path d="M5 5h3V3h9v2h3v3h2v8h-2v3h-3v2H7v-2H4v-4h4v2h8v-2h2V9h-2V7H8v3H3V5h2z" fill="currentColor" />
  ),
  restock: (
    <>
      <path d="M3 10h13v11H3z" fill="currentColor" />
      <path d="M5 12h9v7H5z" fill="white" opacity=".3" />
      <path d="M16 3h3v7h3l-5 6-5-6h3V3z" fill="currentColor" />
    </>
  ),
  scanner: (
    <>
      <path d="M4 3h16v12H4z" fill="currentColor" />
      <path d="M7 6h10v6H7z" fill="white" opacity=".8" />
      <path d="M7 17h10v4H7zM9 13h6v5H9z" fill="currentColor" />
      <path d="M9 8h2v2H9zm4 0h2v2h-2z" fill="currentColor" />
    </>
  ),
  settings: (
    <>
      <path d="M9 2h6l1 4 3-1 3 5-3 2 3 2-3 5-3-1-1 4H9l-1-4-3 1-3-5 3-2-3-2 3-5 3 1z" fill="currentColor" />
      <path d="M9 9h6v6H9z" fill="white" opacity=".85" />
    </>
  ),
  shelf: (
    <>
      <path d="M3 4h18v3H3zm1 5h16v3H4zm-1 5h18v3H3zm1 5h3v3H4zm13 0h3v3h-3z" fill="currentColor" />
      <path d="M7 7h3v2H7zm7 0h3v2h-3zm-7 5h3v2H7zm7 0h3v2h-3z" fill="currentColor" opacity=".55" />
    </>
  ),
  soundOff: (
    <>
      <path d="M3 9h5l5-5v16l-5-5H3z" fill="currentColor" />
      <path d="M16 8h3v3h3v3h-3v3h-3v-3h-2v-3h2z" fill="currentColor" />
    </>
  ),
  soundOn: (
    <>
      <path d="M3 9h5l5-5v16l-5-5H3z" fill="currentColor" />
      <path d="M15 8h3v8h-3zm4-3h3v14h-3z" fill="currentColor" />
    </>
  ),
  speed: (
    <>
      <path d="M4 5h12v3H4zm4 5h13v3H8zm-4 5h12v3H4z" fill="currentColor" />
      <path d="M16 13h3v3h3v3h-3v2h-3z" fill="currentColor" />
    </>
  ),
  star: (
    <path d="M10 2h4l2 6h6v4l-5 3 2 6h-4l-3-3-3 3H5l2-6-5-3V8h6z" fill="currentColor" />
  ),
  target: (
    <>
      <path d="M5 3h14v3h3v13h-3v3H5v-3H2V6h3z" fill="currentColor" />
      <path d="M7 7h10v10H7z" fill="white" opacity=".85" />
      <path d="M10 10h4v4h-4z" fill="currentColor" />
    </>
  ),
  upgrade: (
    <>
      <path d="M9 2h6v3h3v3h3v5h-6v9H9v-9H3V8h3V5h3z" fill="currentColor" />
      <path d="M3 18h4v4H3zm14 0h4v4h-4z" fill="currentColor" opacity=".65" />
    </>
  ),
  warehouse: (
    <>
      <path d="M2 9l10-7 10 7v13H2z" fill="currentColor" />
      <path d="M6 11h12v3H6zm1 5h4v6H7zm6 0h4v6h-4z" fill="white" opacity=".72" />
    </>
  ),
};

export function PixelIcon({
  name,
  size = 24,
  label,
  className,
}: PixelIconProps) {
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
      shapeRendering="crispEdges"
    >
      {label ? <title>{label}</title> : null}
      {ICONS[name]}
    </svg>
  );
}

export interface ProductIconProps {
  productId: ProductId;
  size?: number;
  label?: string;
  className?: string;
}

export function ProductIcon({
  productId,
  size = 48,
  label,
  className,
}: ProductIconProps) {
  const product = PRODUCTS[productId];
  const column = product.atlasFrame % 3;
  const row = Math.floor(product.atlasFrame / 3);
  const style: CSSProperties = {
    width: size,
    height: size,
    flex: `0 0 ${size}px`,
    backgroundImage: 'url("/assets/game/product-atlas.png")',
    backgroundPosition: `${column * 50}% ${row * 100}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "300% 200%",
    imageRendering: "pixelated",
  };

  return (
    <span
      className={["product-icon", className].filter(Boolean).join(" ")}
      style={style}
      role="img"
      aria-label={label ?? product.name}
    />
  );
}
