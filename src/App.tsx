import { useSyncExternalStore } from "react";
import { StarweaverCanvas } from "./components/StarweaverCanvas";
import { StarweaverIcon } from "./components/StarweaverIcon";
import { formatTime } from "./game/starweaver";
import { starweaverEvents } from "./game/starweaverEvents";

const SCORE_FORMATTER = new Intl.NumberFormat("zh-CN");

function Ornament() {
  return (
    <span className="ornament" aria-hidden="true">
      <i />
      <b>✦</b>
      <i />
    </span>
  );
}

function IconButton({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string;
  icon: "pause" | "play" | "sound-on" | "sound-off";
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <StarweaverIcon name={icon} />
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="primary-button" onClick={onClick}>
      <span>{children}</span>
    </button>
  );
}

export function App() {
  const snapshot = useSyncExternalStore(
    (listener) => starweaverEvents.subscribe(listener),
    () => starweaverEvents.getSnapshot(),
    () => starweaverEvents.getSnapshot(),
  );
  const formattedScore = SCORE_FORMATTER.format(snapshot.score);
  const formattedBest = SCORE_FORMATTER.format(snapshot.bestScore);
  const isPlaying = snapshot.status === "playing";
  const isPaused = snapshot.status === "paused";
  const showHud = isPlaying || isPaused;

  return (
    <main className="app-stage">
      <section
        className="starweaver-shell"
        data-status={snapshot.status}
        data-score={snapshot.score}
        data-stitches={snapshot.stitches}
      >
        <StarweaverCanvas />

        {showHud && (
          <header className="game-hud" aria-label="本局状态">
            <h1 className="hud-wordmark">星轨织者</h1>
            <time className="hud-time" aria-label="剩余时间">
              {formatTime(snapshot.timeRemainingMs)}
            </time>
            <div className="hud-score" aria-label="本局进度">
              <span>
                缝合 <strong>{String(snapshot.stitches).padStart(2, "0")}</strong>
              </span>
              <span>
                连击 <strong>×{snapshot.combo}</strong>
              </span>
            </div>
          </header>
        )}

        <nav className="utility-controls" aria-label="游戏控制">
          {showHud && (
            <IconButton
              label={isPaused ? "继续游戏" : "暂停游戏"}
              icon={isPaused ? "play" : "pause"}
              pressed={isPaused}
              onClick={() => starweaverEvents.command("toggle-pause")}
            />
          )}
          <IconButton
            label={snapshot.soundEnabled ? "关闭声音" : "开启声音"}
            icon={snapshot.soundEnabled ? "sound-on" : "sound-off"}
            pressed={snapshot.soundEnabled}
            onClick={() => starweaverEvents.command("toggle-sound")}
          />
        </nav>

        {snapshot.status === "ready" && (
          <section className="ready-state" aria-labelledby="ready-title">
            <div className="ready-copy">
              <h1 id="ready-title">
                <span>星轨</span>
                <span>织者</span>
              </h1>
              <p>借星之力，把失落的夜重新缝好。</p>
            </div>
            <div className="ready-action">
              <PrimaryButton
                onClick={() => starweaverEvents.command("restart")}
              >
                穿针入夜
              </PrimaryButton>
              <p>按住牵引 · 松开发射</p>
              <small>鼠标 · 触屏 · 空格</small>
            </div>
          </section>
        )}

        {snapshot.status === "paused" && (
          <section className="pause-state" aria-labelledby="pause-title">
            <Ornament />
            <h2 id="pause-title">星图停住了</h2>
            <PrimaryButton
              onClick={() => starweaverEvents.command("toggle-pause")}
            >
              继续穿行
            </PrimaryButton>
          </section>
        )}

        {snapshot.status === "gameover" && (
          <section className="result-state" aria-labelledby="result-title">
            <div className="result-copy">
              <h1 id="result-title">今夜已经缝好</h1>
              <Ornament />
              <strong className="result-score">{formattedScore}</strong>
              <dl className="result-stats">
                <div>
                  <dt>缝合</dt>
                  <dd>{String(snapshot.stitches).padStart(2, "0")}</dd>
                </div>
                <div>
                  <dt>最长连击</dt>
                  <dd>×{snapshot.maxCombo}</dd>
                </div>
                <div>
                  <dt>险距</dt>
                  <dd>{String(snapshot.nearMisses).padStart(2, "0")}</dd>
                </div>
              </dl>
              <p className="best-score">最佳 {formattedBest}</p>
              <div className="result-actions">
                <PrimaryButton
                  onClick={() => starweaverEvents.command("restart")}
                >
                  再织一夜
                </PrimaryButton>
              </div>
            </div>
          </section>
        )}

        {isPlaying && (
          <p className="control-hint">按住牵引 · 松开发射</p>
        )}

        {snapshot.label && isPlaying && (
          <div
            key={snapshot.eventSequence}
            className="event-callout"
            aria-live="polite"
          >
            {snapshot.label}
          </div>
        )}
      </section>
    </main>
  );
}
