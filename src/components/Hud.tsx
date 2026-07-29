import { PixelIcon } from "./PixelIcon";

export interface HudProps {
  day: number;
  elapsedSeconds: number;
  dayDurationSeconds: number;
  money: number;
  reputation: number;
  dayRevenue: number;
  dailyTarget: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenSettings: () => void;
}

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

function getClockLabel(elapsedSeconds: number, dayDurationSeconds: number) {
  const safeDuration = Math.max(1, dayDurationSeconds);
  const progress = Math.min(1, Math.max(0, elapsedSeconds / safeDuration));
  const openingMinutes = 8 * 60;
  const businessMinutes = 12 * 60;
  const totalMinutes = openingMinutes + Math.round(progress * businessMinutes);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function Hud({
  day,
  elapsedSeconds,
  dayDurationSeconds,
  money,
  reputation,
  dayRevenue,
  dailyTarget,
  soundEnabled,
  onToggleSound,
  onOpenSettings,
}: HudProps) {
  const clockLabel = getClockLabel(elapsedSeconds, dayDurationSeconds);
  const normalizedReputation = Math.min(
    5,
    Math.max(0, reputation > 5 ? reputation / 20 : reputation),
  );
  const filledHearts = Math.round(normalizedReputation);
  const targetProgress =
    dailyTarget > 0 ? Math.min(1, Math.max(0, dayRevenue / dailyTarget)) : 0;

  return (
    <header className="game-hud" aria-label="超市经营信息">
      <div className="hud-brand" aria-label="松果小市">
        <span className="hud-brand__mark">
          <PixelIcon name="acorn" size={30} />
        </span>
        <span className="hud-brand__name">松果小市</span>
      </div>

      <div className="hud-metric hud-clock">
        <PixelIcon name="clock" size={24} />
        <span className="hud-metric__value">
          第 {day} 天 <span aria-hidden="true">·</span> {clockLabel}
        </span>
      </div>

      <div
        className="hud-metric hud-money"
        aria-label={`现金 ${moneyFormatter.format(money)} 元`}
      >
        <PixelIcon name="coin" size={24} />
        <span className="hud-metric__value">
          ¥{moneyFormatter.format(money)}
        </span>
      </div>

      <div
        className="hud-metric hud-reputation"
        aria-label={`口碑 ${normalizedReputation.toFixed(1)} 星，满分 5 星`}
      >
        <span className="hud-metric__label">口碑</span>
        <span className="hud-hearts" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <PixelIcon
              className={
                index < filledHearts
                  ? "hud-heart hud-heart--filled"
                  : "hud-heart hud-heart--empty"
              }
              key={index}
              name="heart"
              size={21}
            />
          ))}
        </span>
      </div>

      <div
        className="hud-metric hud-target"
        aria-label={`今日营业额 ${moneyFormatter.format(dayRevenue)} 元，目标 ${moneyFormatter.format(dailyTarget)} 元`}
      >
        <PixelIcon name="target" size={24} />
        <span className="hud-target__copy">
          <span className="hud-metric__label">今日目标</span>
          <span className="hud-metric__value">
            ¥{moneyFormatter.format(dayRevenue)}
            <span className="hud-target__separator"> / </span>
            ¥{moneyFormatter.format(dailyTarget)}
          </span>
        </span>
        <span className="hud-target__track" aria-hidden="true">
          <span
            className="hud-target__fill"
            style={{ width: `${targetProgress * 100}%` }}
          />
        </span>
      </div>

      <div className="hud-actions">
        <button
          className="icon-button"
          type="button"
          aria-label={soundEnabled ? "关闭音效" : "开启音效"}
          aria-pressed={soundEnabled}
          onClick={onToggleSound}
        >
          <PixelIcon
            name={soundEnabled ? "soundOn" : "soundOff"}
            size={24}
          />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="打开游戏设置"
          onClick={onOpenSettings}
        >
          <PixelIcon name="settings" size={25} />
        </button>
      </div>
    </header>
  );
}
