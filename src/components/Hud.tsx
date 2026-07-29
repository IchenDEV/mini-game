import { HarborIcon, type HarborIconName } from "./PixelIcon";

export interface HudProps {
  day: number;
  periodLabel: string;
  weatherLabel: string;
  weatherIcon: HarborIconName;
  money: number;
  level: number;
  levelProgress: number;
  reputation: number;
  castsUsed: number;
  castsPerDay: number;
  soundEnabled: boolean;
  paused: boolean;
  onToggleSound: () => void;
  onTogglePause: () => void;
  onOpenSettings: () => void;
}

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function Hud({
  day,
  periodLabel,
  weatherLabel,
  weatherIcon,
  money,
  level,
  levelProgress,
  reputation,
  castsUsed,
  castsPerDay,
  soundEnabled,
  paused,
  onToggleSound,
  onTogglePause,
  onOpenSettings,
}: HudProps) {
  const safeLevelProgress = clampUnit(levelProgress);
  const safeReputation = Math.max(0, Math.round(reputation));

  return (
    <header className="game-hud" aria-label="航海经营信息">
      <div className="hud-brand" aria-label="海风渔港">
        <HarborIcon name="anchor" size={29} />
        <span>海风渔港</span>
      </div>

      <div className="hud-day">
        <strong>第 {day} 天</strong>
        <span className="hud-day__weather">
          <HarborIcon name={weatherIcon} size={22} />
          {weatherLabel}
        </span>
        <span>{periodLabel}</span>
      </div>

      <div
        className="hud-metric hud-money"
        aria-label={`金币 ${numberFormatter.format(money)}`}
      >
        <HarborIcon name="coin" size={27} />
        <strong>{numberFormatter.format(money)}</strong>
      </div>

      <div
        className="hud-metric hud-level"
        aria-label={`船长等级 ${level}，经验进度 ${Math.round(
          safeLevelProgress * 100,
        )}%`}
      >
        <span className="hud-level__label">Lv.{level}</span>
        <span className="hud-progress">
          <span
            className="hud-progress__fill"
            style={{ width: `${safeLevelProgress * 100}%` }}
          />
        </span>
      </div>

      <div
        className="hud-metric hud-reputation"
        aria-label={`港口声望 ${safeReputation}`}
      >
        <HarborIcon name="star" size={25} />
        <span>
          <small>声望</small>
          <strong>{numberFormatter.format(safeReputation)}</strong>
        </span>
      </div>

      <div
        className="hud-metric hud-casts"
        aria-label={`今日已出竿 ${castsUsed} 次，共 ${castsPerDay} 次`}
      >
        <HarborIcon name="hook" size={23} />
        <span>
          <small>今日出竿</small>
          <strong>
            {castsUsed}/{castsPerDay}
          </strong>
        </span>
      </div>

      <div className="hud-actions">
        <button
          className="hud-icon-button"
          type="button"
          aria-label={paused ? "继续游戏" : "暂停游戏"}
          aria-pressed={paused}
          onClick={onTogglePause}
        >
          <HarborIcon name={paused ? "play" : "pause"} size={23} />
        </button>
        <button
          className="hud-icon-button"
          type="button"
          aria-label={soundEnabled ? "关闭音效" : "开启音效"}
          aria-pressed={soundEnabled}
          onClick={onToggleSound}
        >
          <HarborIcon
            name={soundEnabled ? "soundOn" : "soundOff"}
            size={23}
          />
        </button>
        <button
          className="hud-icon-button"
          type="button"
          aria-label="打开游戏设置"
          onClick={onOpenSettings}
        >
          <HarborIcon name="settings" size={24} />
        </button>
      </div>
    </header>
  );
}
