export type StarweaverIconName =
  | "pause"
  | "play"
  | "sound-on"
  | "sound-off";

export interface StarweaverIconProps {
  name: StarweaverIconName;
  size?: number;
}

export function StarweaverIcon({
  name,
  size = 28,
}: StarweaverIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "pause") {
    return (
      <svg {...common}>
        <path d="M10.25 7.25v17.5M21.75 7.25v17.5" />
        <path d="M7.5 5.25h5.5M19 5.25h5.5M7.5 26.75h5.5M19 26.75h5.5" />
      </svg>
    );
  }

  if (name === "play") {
    return (
      <svg {...common}>
        <path d="M10 6.75 24.25 16 10 25.25Z" />
        <path d="M7.25 4.75v22.5" />
      </svg>
    );
  }

  if (name === "sound-off") {
    return (
      <svg {...common}>
        <path d="M5.5 13h5l6-5v16l-6-5h-5Z" />
        <path d="m22 12 5.5 8M27.5 12 22 20" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5.5 13h5l6-5v16l-6-5h-5Z" />
      <path d="M21 12.25c1.35 1 2 2.25 2 3.75s-.65 2.75-2 3.75" />
      <path d="M24.5 8.75c2.5 2 3.75 4.42 3.75 7.25s-1.25 5.25-3.75 7.25" />
    </svg>
  );
}
