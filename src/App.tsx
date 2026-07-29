import { useEffect, useMemo, useReducer, useState } from "react";
import { ActionBar } from "./components/ActionBar";
import { GameCanvas } from "./components/GameCanvas";
import { Hud } from "./components/Hud";
import { ManagementDrawer } from "./components/ManagementDrawer";
import {
  DayEndModal,
  GameEndModal,
  SettingsModal,
  Toast,
  TutorialOverlay,
} from "./components/Overlays";
import { DAILY_TARGETS } from "./data/products";
import { createInitialGameState, gameReducer, getShelfCapacity } from "./game/engine";
import { playSaleChime, playUiTick, playWarningTone } from "./game/sound";
import { clearGameSave, loadGameSave, saveGame } from "./game/storage";
import type { DrawerMode, GameAction } from "./game/types";

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function App() {
  const qaMode = useMemo(
    () => new URLSearchParams(window.location.search).get("qa") === "1",
    [],
  );
  const [state, dispatch] = useReducer(
    gameReducer,
    qaMode,
    (isQaMode) => loadGameSave(isQaMode) ?? createInitialGameState(isQaMode),
  );
  const [tutorialStep, setTutorialStep] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    saveGame(state);
  }, [state]);

  useEffect(() => {
    if (state.status !== "playing" || !state.tutorialSeen) return;
    const timer = window.setInterval(() => {
      dispatch({ type: "TICK" });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.status, state.tutorialSeen]);

  useEffect(() => {
    if (!state.toast) return;
    const toastId = state.toast.id;
    const timer = window.setTimeout(() => {
      dispatch({ type: "DISMISS_TOAST", toastId });
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [state.toast]);

  useEffect(() => {
    if (state.salePulse && state.soundEnabled) {
      playSaleChime();
    }
  }, [state.salePulse, state.soundEnabled]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || settingsOpen) return;

      const drawerByKey: Partial<Record<string, DrawerMode>> = {
        "1": "order",
        "2": "restock",
        "3": "upgrade",
      };
      const drawer = drawerByKey[event.key];
      if (drawer) {
        dispatch({ type: "SET_DRAWER", drawer });
        playUiTick();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        dispatch({ type: "CHECKOUT_NEXT" });
      } else if (event.key.toLowerCase() === "p") {
        dispatch({ type: "TOGGLE_PAUSE" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen]);

  const perform = (action: GameAction, tone: "tick" | "warning" = "tick") => {
    dispatch(action);
    if (!state.soundEnabled) return;
    if (tone === "warning") playWarningTone();
    else playUiTick();
  };

  const finishTutorial = () => {
    setTutorialStep(0);
    dispatch({ type: "DISMISS_TUTORIAL" });
    if (state.soundEnabled) playUiTick();
  };

  const resetGame = () => {
    if (!window.confirm("确定要清除当前经营进度并重新开店吗？")) return;
    clearGameSave();
    dispatch({ type: "RESET_GAME", qaMode });
    setSettingsOpen(false);
    setTutorialStep(0);
  };

  const target = DAILY_TARGETS[state.day] ?? DAILY_TARGETS[3];
  const nextTarget =
    state.day < 3 ? (DAILY_TARGETS[state.day + 1] ?? DAILY_TARGETS[3]) : undefined;

  return (
    <div className="app-stage">
      <div className="market-shell" data-game-status={state.status}>
        <Hud
          day={state.day}
          elapsedSeconds={state.elapsedSeconds}
          dayDurationSeconds={state.dayDurationSeconds}
          money={state.money}
          reputation={state.reputation}
          dayRevenue={state.stats.revenue}
          dailyTarget={target}
          soundEnabled={state.soundEnabled}
          onToggleSound={() => perform({ type: "TOGGLE_SOUND" })}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="game-workspace">
          <section className="playfield" aria-label="松果小市营业区">
            <GameCanvas
              customers={state.customers}
              salePulse={state.salePulse}
              paused={state.status !== "playing"}
              onCheckout={() => dispatch({ type: "CHECKOUT_NEXT" })}
            />
            <div className="playfield-status" aria-live="polite">
              <span>
                排队 <strong>{state.customers.filter((item) => item.phase === "queue").length}</strong>
              </span>
              <span>
                货架余量{" "}
                <strong>
                  {Object.values(state.shelves).reduce((sum, value) => sum + value, 0)}
                </strong>
              </span>
              <span className={state.checkoutCooldown > 0 ? "is-cooling" : "is-ready"}>
                {state.checkoutCooldown > 0
                  ? `收银准备 ${state.checkoutCooldown}s`
                  : "收银台就绪"}
              </span>
            </div>
          </section>

          <ManagementDrawer
            mode={state.drawer}
            money={state.money}
            shelves={state.shelves}
            warehouse={state.warehouse}
            orderDraft={state.orderDraft}
            upgrades={state.upgrades}
            shelfCapacity={getShelfCapacity(state)}
            onSetOrderQuantity={(productId, quantity) =>
              dispatch({ type: "SET_ORDER_QUANTITY", productId, quantity })
            }
            onConfirmOrder={() => dispatch({ type: "CONFIRM_ORDER" })}
            onRestockOne={(productId) =>
              dispatch({ type: "RESTOCK_ONE", productId })
            }
            onRestockAll={(productId) =>
              dispatch({ type: "RESTOCK_ALL", productId })
            }
            onBuyUpgrade={(upgradeId) =>
              dispatch({ type: "BUY_UPGRADE", upgradeId })
            }
          />
        </main>

        <ActionBar
          activeDrawer={state.drawer}
          status={state.status}
          speed={state.speed}
          onSelectDrawer={(drawer) =>
            perform({ type: "SET_DRAWER", drawer })
          }
          onTogglePause={() => perform({ type: "TOGGLE_PAUSE" })}
          onToggleSpeed={() => perform({ type: "TOGGLE_SPEED" })}
        />

        <Toast
          toast={state.toast}
          onDismiss={() => {
            if (state.toast) {
              dispatch({ type: "DISMISS_TOAST", toastId: state.toast.id });
            }
          }}
        />

        {!state.tutorialSeen && (
          <TutorialOverlay
            step={tutorialStep}
            onNext={() => {
              if (tutorialStep >= 3) finishTutorial();
              else setTutorialStep((current) => current + 1);
            }}
            onSkip={finishTutorial}
          />
        )}

        {state.status === "dayEnd" && state.lastDayStats && (
          <DayEndModal
            day={state.day}
            stats={state.lastDayStats}
            totalProfit={state.totalProfit}
            reputation={state.reputation}
            nextDayTarget={nextTarget}
            onContinue={() => dispatch({ type: "START_NEXT_DAY" })}
          />
        )}

        {state.status === "gameEnd" && (
          <GameEndModal
            totalProfit={state.totalProfit}
            reputation={state.reputation}
            totalRevenue={state.lifetimeStats.revenue}
            totalServed={state.lifetimeStats.served}
            totalLost={state.lifetimeStats.lost}
            onRestart={resetGame}
          />
        )}

        {settingsOpen && (
          <SettingsModal
            soundEnabled={state.soundEnabled}
            onToggleSound={() => dispatch({ type: "TOGGLE_SOUND" })}
            onClearSave={resetGame}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
      <p className="desktop-hint">空格收银 · 1/2/3 切换面板 · P 暂停</p>
    </div>
  );
}
