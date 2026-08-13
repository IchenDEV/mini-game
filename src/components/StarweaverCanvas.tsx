import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { StarweaverScene } from "../game/StarweaverScene";
import { starweaverEvents } from "../game/starweaverEvents";

export function StarweaverCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent || gameRef.current) return;

    let destroyed = false;
    const syncStatusAttribute = () => {
      if (!destroyed) {
        parent.dataset.status = starweaverEvents.getSnapshot().status;
      }
    };
    syncStatusAttribute();
    const unsubscribeStatus = starweaverEvents.subscribe(syncStatusAttribute);

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: Math.max(1, parent.clientWidth),
      height: Math.max(1, parent.clientHeight),
      backgroundColor: "#06110f",
      transparent: false,
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      render: {
        antialias: true,
        antialiasGL: true,
        pixelArt: false,
        roundPixels: false,
        powerPreference: "high-performance",
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: Math.max(1, parent.clientWidth),
        height: Math.max(1, parent.clientHeight),
      },
      input: {
        activePointers: 3,
      },
      scene: [StarweaverScene],
    });
    gameRef.current = game;

    return () => {
      destroyed = true;
      unsubscribeStatus();
      if (gameRef.current === game) gameRef.current = null;
      game.destroy(true);
      parent.replaceChildren();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="game-canvas starweaver-canvas"
      data-status="ready"
      role="application"
      aria-label="星轨织者游戏星图。按住鼠标、触控或空格键绕锚星蓄势，松开后沿切线穿梭。按 P 暂停，M 静音，R 重开。"
      tabIndex={0}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        touchAction: "none",
        outline: "none",
      }}
    />
  );
}

export default StarweaverCanvas;
