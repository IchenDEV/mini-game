import type { DrawerMode, GameStatus } from "../game/types";
import { PixelIcon, type PixelIconName } from "./PixelIcon";

export interface ActionBarProps {
  activeDrawer: DrawerMode;
  status: GameStatus;
  speed: 1 | 2;
  onSelectDrawer: (drawer: DrawerMode) => void;
  onTogglePause: () => void;
  onToggleSpeed: () => void;
}

const DRAWER_ACTIONS: ReadonlyArray<{
  id: DrawerMode;
  label: string;
  icon: PixelIconName;
}> = [
  { id: "order", label: "进货", icon: "order" },
  { id: "restock", label: "补货", icon: "restock" },
  { id: "upgrade", label: "升级", icon: "upgrade" },
];

export function ActionBar({
  activeDrawer,
  status,
  speed,
  onSelectDrawer,
  onTogglePause,
  onToggleSpeed,
}: ActionBarProps) {
  const isPlaying = status === "playing";
  const canControlTime = status === "playing" || status === "paused";

  return (
    <nav className="action-bar" aria-label="经营操作">
      <div className="action-bar__management">
        {DRAWER_ACTIONS.map((action) => {
          const active = activeDrawer === action.id;

          return (
            <button
              className={[
                "action-button",
                `action-button--${action.id}`,
                active ? "action-button--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              key={action.id}
              aria-pressed={active}
              onClick={() => onSelectDrawer(action.id)}
            >
              <span className="action-button__icon">
                <PixelIcon name={action.icon} size={34} />
              </span>
              <span className="action-button__label">{action.label}</span>
            </button>
          );
        })}
      </div>

      <div className="action-bar__time-controls">
        <button
          className="action-button action-button--compact"
          type="button"
          disabled={!canControlTime}
          aria-label={isPlaying ? "暂停营业" : "继续营业"}
          aria-pressed={!isPlaying}
          onClick={onTogglePause}
        >
          <PixelIcon name={isPlaying ? "pause" : "play"} size={28} />
          <span>{isPlaying ? "暂停" : "继续"}</span>
        </button>

        <button
          className="action-button action-button--compact action-button--speed"
          type="button"
          disabled={!canControlTime}
          aria-label={`当前 ${speed} 倍速，点击切换为 ${speed === 1 ? 2 : 1} 倍速`}
          aria-pressed={speed === 2}
          onClick={onToggleSpeed}
        >
          <PixelIcon name="speed" size={28} />
          <span>{speed}x</span>
        </button>
      </div>
    </nav>
  );
}
