import { useEffect, useRef, useState } from "react";
import { GameShell } from "./kit/engine";
import type { GameDefinition, LogicSnapshot } from "./kit/types";
import { BackIcon, PauseIcon, PlayIcon, SoundOffIcon, SoundOnIcon } from "./icons";

interface PlayViewProps {
  def: GameDefinition;
  onExit: () => void;
}

export function PlayView({ def, onExit }: PlayViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<GameShell | null>(null);
  const [hud, setHud] = useState<LogicSnapshot | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHud(null);
    const shell = new GameShell(canvas, def, setHud, setSoundOn);
    shellRef.current = shell;
    setSoundOn(shell.soundEnabled);
    return () => {
      shell.dispose();
      shellRef.current = null;
    };
  }, [def]);

  const status = hud?.status ?? "ready";
  const isPlaying = status === "playing";
  const isPaused = status === "paused";
  const isOver = status === "over";
  const isNewBest = isOver && (hud?.score ?? 0) > 0 && hud?.score === hud?.best;

  return (
    <main className="play" data-game={def.id}>
      <canvas ref={canvasRef} className="play-canvas" />

      <header className="play-topbar">
        <button type="button" className="chip-button" onClick={onExit}>
          <BackIcon />
          <span>大厅</span>
        </button>
        <span className="play-topbar-name">
          {String(def.no).padStart(2, "0")} · {def.name}
        </span>
        <span className="play-topbar-actions">
          <button
            type="button"
            className="chip-button"
            aria-label={soundOn ? "关闭声音" : "开启声音"}
            onClick={() => shellRef.current?.toggleSound()}
          >
            {soundOn ? <SoundOnIcon /> : <SoundOffIcon />}
          </button>
          {(isPlaying || isPaused) && (
            <button
              type="button"
              className="chip-button"
              aria-label={isPaused ? "继续" : "暂停"}
              onClick={() => shellRef.current?.togglePause()}
            >
              {isPaused ? <PlayIcon /> : <PauseIcon />}
            </button>
          )}
        </span>
      </header>

      {isPlaying && hud && (
        <>
          <div className="play-score" aria-label="得分">
            <strong>{hud.score.toLocaleString("zh-CN")}</strong>
            <span>最高 {hud.best.toLocaleString("zh-CN")}</span>
          </div>
          <div className="play-fields">
            {hud.fields.map((field) => (
              <span key={field.label}>
                {field.label} <strong>{field.value}</strong>
              </span>
            ))}
          </div>
          {hud.callout && (
            <div key={hud.callout.key} className="play-callout" aria-live="polite">
              {hud.callout.text}
            </div>
          )}
          <p className="play-hint">{hud.hint}</p>
          {hud.meter !== null && (
            <div className="play-meter" aria-label={hud.meterLabel}>
              <i style={{ width: `${Math.round(Math.max(0, Math.min(1, hud.meter)) * 100)}%` }} />
              <span>{hud.meterLabel}</span>
            </div>
          )}
        </>
      )}

      {status === "ready" && (
        <section className="play-overlay" aria-labelledby="ready-title">
          <div className="play-panel" style={{ ["--accent" as string]: def.accent }}>
            <p className="play-panel-no">{String(def.no).padStart(2, "0")} 号机台</p>
            <h1 id="ready-title">{def.name}</h1>
            <p className="play-panel-tagline">{def.tagline}</p>
            <p className="play-panel-controls">{def.controls}</p>
            <button
              type="button"
              className="play-panel-start"
              onClick={() => shellRef.current?.start()}
            >
              开始游戏
            </button>
            <p className="play-panel-note">空格 / 回车 / 点击画面 也可开始 · P 暂停 · M 声音 · R 重开</p>
          </div>
        </section>
      )}

      {isPaused && (
        <section className="play-overlay" aria-labelledby="paused-title">
          <div className="play-panel">
            <h1 id="paused-title">暂停中</h1>
            <button
              type="button"
              className="play-panel-start"
              onClick={() => shellRef.current?.togglePause()}
            >
              继续游戏
            </button>
            <p className="play-panel-note">P 继续 · R 重开</p>
          </div>
        </section>
      )}

      {isOver && hud && (
        <section className="play-overlay" aria-labelledby="over-title">
          <div className="play-panel" style={{ ["--accent" as string]: def.accent }}>
            <h1 id="over-title">{isNewBest ? "新纪录！" : "本局结束"}</h1>
            <strong className="play-panel-score">
              {hud.score.toLocaleString("zh-CN")}
            </strong>
            {hud.detail && <p className="play-panel-detail">{hud.detail}</p>}
            <p className="play-panel-best">
              {isNewBest ? "刷新了本机最高分" : `本机最高 ${hud.best.toLocaleString("zh-CN")}`}
            </p>
            <div className="play-panel-actions">
              <button
                type="button"
                className="play-panel-start"
                onClick={() => shellRef.current?.restart()}
              >
                再来一局
              </button>
              <button type="button" className="chip-button" onClick={onExit}>
                返回大厅
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
