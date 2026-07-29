import { useEffect, useRef } from "react";
import Phaser from "phaser";
import {
  gameEvents,
  type FishingReelVisual,
  type FishingVisualPhase,
  type SceneEffectPulse,
} from "../game/events";
import {
  FishingScene,
  GAME_HEIGHT,
  GAME_WIDTH,
} from "../game/FishingScene";

export interface GameCanvasProps {
  phase: FishingVisualPhase;
  castPower: number;
  reel: FishingReelVisual | null;
  fishFrame?: number;
  weather?: string;
  paused: boolean;
  effectPulse?: SceneEffectPulse | null;
  onPrimaryAction: () => void;
}

export function GameCanvas({
  phase,
  castPower,
  reel,
  fishFrame,
  weather,
  paused,
  effectPulse,
  onPrimaryAction,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const onPrimaryActionRef = useRef(onPrimaryAction);
  const lastEffectIdRef = useRef<number | null>(null);
  const initialVisualRef = useRef({
    phase,
    castPower,
    reel,
    fishFrame,
    weather,
  });
  const initialPausedRef = useRef(paused);

  onPrimaryActionRef.current = onPrimaryAction;

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent || gameRef.current) return;

    gameEvents.emit("scene:sync", initialVisualRef.current);
    gameEvents.emit("scene:paused", initialPausedRef.current);
    const unsubscribePrimary = gameEvents.on("primary:request", () =>
      onPrimaryActionRef.current(),
    );

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: "#1e9dcc",
      transparent: false,
      pixelArt: false,
      antialias: true,
      roundPixels: false,
      render: {
        antialias: true,
        antialiasGL: true,
        pixelArt: false,
        roundPixels: false,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
      },
      scene: [FishingScene],
    });
    gameRef.current = game;

    return () => {
      unsubscribePrimary();
      if (gameRef.current === game) gameRef.current = null;
      game.destroy(true);
      parent.replaceChildren();
    };
  }, []);

  useEffect(() => {
    gameEvents.emit("scene:sync", {
      phase,
      castPower,
      reel,
      fishFrame,
      weather,
    });
  }, [castPower, fishFrame, phase, reel, weather]);

  useEffect(() => {
    gameEvents.emit("scene:paused", paused);
  }, [paused]);

  useEffect(() => {
    if (
      !effectPulse ||
      effectPulse.id === lastEffectIdRef.current
    ) {
      return;
    }
    lastEffectIdRef.current = effectPulse.id;
    gameEvents.emit("scene:effect", effectPulse);
  }, [effectPulse]);

  return (
    <div
      ref={containerRef}
      className="game-canvas"
      role="application"
      aria-label="海风渔港钓鱼水域。可点击水面执行当前钓鱼动作。"
      style={{
        width: "100%",
        aspectRatio: `${GAME_WIDTH} / ${GAME_HEIGHT}`,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
      }}
    />
  );
}

export default GameCanvas;
