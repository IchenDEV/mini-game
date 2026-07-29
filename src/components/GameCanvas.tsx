import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { gameEvents } from "../game/events";
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  MarketScene,
} from "../game/MarketScene";
import type { Customer, SalePulse } from "../game/types";

export interface GameCanvasProps {
  customers: Customer[];
  salePulse: SalePulse | null;
  paused: boolean;
  onCheckout: () => void;
}

export function GameCanvas({
  customers,
  salePulse,
  paused,
  onCheckout,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const onCheckoutRef = useRef(onCheckout);
  const initialStateRef = useRef({ customers, paused });
  const lastSaleIdRef = useRef<number | null>(null);

  onCheckoutRef.current = onCheckout;

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent || gameRef.current) {
      return;
    }

    gameEvents.emit(
      "customers:sync",
      initialStateRef.current.customers,
    );
    gameEvents.emit("game:paused", initialStateRef.current.paused);

    const unsubscribeCheckout = gameEvents.on(
      "checkout:request",
      () => onCheckoutRef.current(),
    );

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: "#f7dfad",
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      render: {
        antialias: false,
        antialiasGL: false,
        pixelArt: true,
        roundPixels: true,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
      },
      scene: [MarketScene],
    });
    gameRef.current = game;

    return () => {
      unsubscribeCheckout();
      if (gameRef.current === game) {
        gameRef.current = null;
      }
      game.destroy(true);
      parent.replaceChildren();
    };
  }, []);

  useEffect(() => {
    gameEvents.emit("customers:sync", customers);
  }, [customers]);

  useEffect(() => {
    gameEvents.emit("game:paused", paused);
  }, [paused]);

  useEffect(() => {
    if (
      salePulse === null ||
      salePulse.id === lastSaleIdRef.current
    ) {
      return;
    }

    lastSaleIdRef.current = salePulse.id;
    gameEvents.emit("sale:pulse", salePulse);
  }, [salePulse]);

  return (
    <div
      ref={containerRef}
      className="game-canvas"
      role="application"
      aria-label="松果小超市经营场景"
      style={{
        width: "100%",
        aspectRatio: `${GAME_WIDTH} / ${GAME_HEIGHT}`,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        imageRendering: "pixelated",
      }}
    />
  );
}

export default GameCanvas;
