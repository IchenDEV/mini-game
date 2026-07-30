import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ActionBar } from "./components/ActionBar";
import { GameCanvas } from "./components/GameCanvas";
import { Hud } from "./components/Hud";
import {
  GearWorkshop,
  OrdersBoard,
} from "./components/ManagementDrawer";
import {
  CatchModal,
  CollectionModal,
  CoolerModal,
  DayEndModal,
  SettingsModal,
  Toast,
  TutorialOverlay,
} from "./components/Overlays";
import { HarborIcon } from "./components/PixelIcon";
import {
  BAIT_LIST,
  FISH_SPECIES,
  LOCATIONS,
  WEATHERS,
} from "./data/fishing";
import {
  canFulfillOrder,
  createInitialGameState,
  gameReducer,
  generateCatch,
  getCoolerCapacity,
  getGearUpgradeCost,
  getLevelProgress,
  getReelTarget,
} from "./game/engine";
import type {
  FishingReelVisual,
  SceneEffectPulse,
} from "./game/events";
import {
  playBiteWhistle,
  playCastSplash,
  playCatchChime,
  playCoinChime,
  playUiTap,
  playUpgradeStamp,
  playWarningTone,
} from "./game/sound";
import { clearGameSave, loadGameSave, saveGame } from "./game/storage";
import {
  type BaitId,
  type GameAction,
  type GearId,
  type LocationId,
} from "./game/types";

const BAIT_ICONS = {
  bread: "baitWorm",
  shrimp: "baitShrimp",
  "glow-worm": "baitLure",
} as const;

const WEATHER_ICONS = {
  sunny: "sun",
  breezy: "wind",
  rainy: "rain",
  starry: "star",
} as const;

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isNativeControlTarget(target: EventTarget | null): boolean {
  return isTypingTarget(target) || target instanceof HTMLButtonElement;
}

function getPeriodLabel(castsUsed: number, dailyLimit: number): string {
  const ratio = dailyLimit > 0 ? castsUsed / dailyLimit : 0;
  if (ratio < 0.34) return "清晨";
  if (ratio < 0.7) return "正午";
  return "傍晚";
}

function getSceneStatus(phase: string): {
  title: string;
  detail: string;
} {
  switch (phase) {
    case "casting":
      return { title: "鱼线划过海风", detail: "浮标正在落向远处" };
    case "waiting":
      return { title: "嘘，浮标有动静", detail: "咬钩时会出现叹号" };
    case "bite":
      return { title: "有鱼咬钩！", detail: "马上扬竿" };
    case "reeling":
      return { title: "稳住张力", detail: "按住升高，松开降低" };
    case "caught":
      return { title: "好鱼上船", detail: "决定存入还是出售" };
    case "idle":
    default:
      return { title: "海面正合适", detail: "选鱼饵，按住甩竿" };
  }
}

function ReelMeter({
  reel,
  targetMin,
  targetWidth,
}: {
  reel: FishingReelVisual;
  targetMin: number;
  targetWidth: number;
}) {
  const safe =
    reel.tension >= targetMin && reel.tension <= targetMin + targetWidth;
  const stateLabel = safe
    ? "稳定"
    : reel.tension > targetMin + targetWidth
      ? "太紧"
      : "太松";

  return (
    <section
      className={safe ? "reel-meter is-safe" : "reel-meter is-danger"}
      aria-label={`鱼线张力 ${Math.round(reel.tension)}，${stateLabel}`}
    >
      <span className="reel-meter__label">张力</span>
      <div className="reel-meter__track">
        <span
          className="reel-meter__safe-zone"
          style={{
            bottom: `${targetMin}%`,
            height: `${targetWidth}%`,
          }}
        />
        <span
          className="reel-meter__needle"
          style={{ bottom: `${reel.tension}%` }}
        >
          <span />
        </span>
      </div>
      <strong>{stateLabel}</strong>
    </section>
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
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [coolerOpen, setCoolerOpen] = useState(false);
  const [castPower, setCastPower] = useState(58);
  const [isHolding, setIsHolding] = useState(false);
  const [effectPulse, setEffectPulse] = useState<SceneEffectPulse | null>(null);
  const blockingModalOpen = settingsOpen || collectionOpen || coolerOpen;

  const stateRef = useRef(state);
  const castPowerRef = useRef(castPower);
  const holdingRef = useRef(isHolding);
  const powerDirectionRef = useRef<1 | -1>(1);
  const previousPhaseRef = useRef(state.phase);
  const effectSequenceRef = useRef(0);

  stateRef.current = state;
  castPowerRef.current = castPower;
  holdingRef.current = isHolding;

  const pulseScene = (kind: SceneEffectPulse["kind"]) => {
    effectSequenceRef.current += 1;
    setEffectPulse({ id: effectSequenceRef.current, kind });
  };

  const playIfEnabled = (sound: () => void) => {
    if (stateRef.current.soundEnabled) sound();
  };

  const perform = (action: GameAction, sound = true) => {
    dispatch(action);
    if (sound) playIfEnabled(playUiTap);
  };

  useEffect(() => {
    saveGame(state);
  }, [state]);

  useEffect(() => {
    if (!isHolding) return;
    const timer = window.setInterval(() => {
      setCastPower((current) => {
        let next = current + powerDirectionRef.current * 3.2;
        if (next >= 100) {
          next = 100;
          powerDirectionRef.current = -1;
        } else if (next <= 16) {
          next = 16;
          powerDirectionRef.current = 1;
        }
        castPowerRef.current = next;
        return next;
      });
    }, 30);
    return () => window.clearInterval(timer);
  }, [isHolding]);

  useEffect(() => {
    if (state.status !== "playing" || blockingModalOpen) return;

    if (state.phase === "casting") {
      const timer = window.setTimeout(
        () => dispatch({ type: "LINE_LANDED" }),
        state.qaMode ? 260 : 640,
      );
      return () => window.clearTimeout(timer);
    }

    if (state.phase === "waiting") {
      const wait = state.qaMode ? 360 : 900 + Math.round(Math.random() * 650);
      const timer = window.setTimeout(() => {
        const snapshot = stateRef.current;
        if (snapshot.status !== "playing" || snapshot.phase !== "waiting") {
          return;
        }
        dispatch({
          type: "FISH_BITE",
          catch: generateCatch(snapshot),
        });
      }, wait);
      return () => window.clearTimeout(timer);
    }

    if (state.phase === "bite") {
      const timer = window.setTimeout(
        () => dispatch({ type: "MISS_BITE" }),
        state.qaMode ? 3600 : 3000,
      );
      return () => window.clearTimeout(timer);
    }

    if (state.phase === "reeling") {
      const timer = window.setInterval(
        () => dispatch({ type: "TICK_REEL" }),
        state.qaMode ? 130 : 125,
      );
      return () => window.clearInterval(timer);
    }
  }, [blockingModalOpen, state.phase, state.qaMode, state.status]);

  useEffect(() => {
    const previous = previousPhaseRef.current;
    if (previous === state.phase) return;
    previousPhaseRef.current = state.phase;

    if (state.phase === "waiting") {
      playIfEnabled(playCastSplash);
    } else if (state.phase === "bite") {
      playIfEnabled(playBiteWhistle);
    } else if (state.phase === "caught") {
      playIfEnabled(playCatchChime);
    }
  }, [state.phase]);

  useEffect(() => {
    if (!state.toast) return;
    if (state.toast.kind === "warning") playIfEnabled(playWarningTone);
    const toastId = state.toast.id;
    const timer = window.setTimeout(
      () => dispatch({ type: "DISMISS_TOAST", toastId }),
      3200,
    );
    return () => window.clearTimeout(timer);
  }, [state.toast]);

  const beginPrimary = () => {
    const current = stateRef.current;
    if (current.status !== "playing") return;

    if (current.phase === "idle") {
      if (current.castsRemaining <= 0) {
        dispatch({ type: "CAST_LINE", power: castPowerRef.current / 100 });
        playIfEnabled(playUiTap);
        return;
      }
      if (current.baitInventory[current.selectedBaitId] <= 0) {
        dispatch({ type: "CAST_LINE", power: castPowerRef.current / 100 });
        return;
      }
      holdingRef.current = true;
      setIsHolding(true);
      playIfEnabled(playUiTap);
      return;
    }

    if (current.phase === "bite") {
      dispatch({ type: "HOOK_FISH" });
      playIfEnabled(playUiTap);
      return;
    }

    if (current.phase === "reeling") {
      dispatch({ type: "SET_REELING", held: true });
    }
  };

  const endPrimary = () => {
    const current = stateRef.current;

    if (holdingRef.current) {
      holdingRef.current = false;
      setIsHolding(false);
      dispatch({ type: "CAST_LINE", power: castPowerRef.current / 100 });
      return;
    }

    if (current.phase === "reeling") {
      dispatch({ type: "SET_REELING", held: false });
    }
  };

  const handleCanvasPrimary = () => {
    const current = stateRef.current;
    if (current.status !== "playing") return;

    if (current.phase === "idle") {
      const quickPower = 68;
      setCastPower(quickPower);
      castPowerRef.current = quickPower;
      dispatch({ type: "CAST_LINE", power: quickPower / 100 });
      playIfEnabled(playUiTap);
    } else if (current.phase === "bite") {
      dispatch({ type: "HOOK_FISH" });
      playIfEnabled(playUiTap);
    } else if (current.phase === "reeling") {
      dispatch({ type: "SET_REELING", held: true });
      window.setTimeout(
        () => dispatch({ type: "SET_REELING", held: false }),
        320,
      );
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        isNativeControlTarget(event.target) ||
        settingsOpen ||
        collectionOpen ||
        coolerOpen ||
        !stateRef.current.tutorialSeen
      ) {
        return;
      }
      event.preventDefault();
      beginPrimary();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isNativeControlTarget(event.target)) {
        return;
      }
      event.preventDefault();
      endPrimary();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [collectionOpen, coolerOpen, settingsOpen]);

  const resetGame = () => {
    if (!window.confirm("确定要清除金币、图鉴和全部升级，重新出海吗？")) {
      return;
    }
    clearGameSave();
    dispatch({ type: "RESET_GAME", qaMode });
    setTutorialStep(0);
    setSettingsOpen(false);
    setCollectionOpen(false);
    setCoolerOpen(false);
    setCastPower(58);
  };

  const prepareOverlayOpen = () => {
    const current = stateRef.current;
    holdingRef.current = false;
    setIsHolding(false);
    if (current.phase === "reeling" && current.reel.held) {
      dispatch({ type: "SET_REELING", held: false });
    }
  };

  const finishTutorial = () => {
    setTutorialStep(0);
    perform({ type: "DISMISS_TUTORIAL" });
  };

  const buyGear = (gearId: GearId) => {
    const cost = getGearUpgradeCost(state, gearId);
    const succeeds =
      state.status !== "paused" &&
      state.phase === "idle" &&
      cost !== null &&
      state.money >= cost;
    dispatch({ type: "BUY_GEAR", gearId });
    if (succeeds) {
      playIfEnabled(playUpgradeStamp);
      pulseScene("upgrade");
    } else {
      playIfEnabled(playUiTap);
    }
  };

  const fulfillOrder = (orderId: string) => {
    const order = state.orders.find((item) => item.id === orderId);
    const succeeds = order ? canFulfillOrder(state, order) : false;
    dispatch({ type: "FULFILL_ORDER", orderId });
    if (succeeds) {
      playIfEnabled(playCoinChime);
      pulseScene("order");
    } else {
      playIfEnabled(playUiTap);
    }
  };

  const sellCatch = (catchId?: string) => {
    dispatch({ type: "SELL_CATCH", catchId });
    playIfEnabled(playCoinChime);
    pulseScene("sale");
  };

  const sellAll = () => {
    if (state.cooler.length === 0) return;
    dispatch({ type: "SELL_ALL" });
    playIfEnabled(playCoinChime);
    pulseScene("sale");
  };

  const castsUsed = state.dailyCastLimit - state.castsRemaining;
  const coolerCapacity = getCoolerCapacity(state);
  const levelProgress = getLevelProgress(state);
  const weather = WEATHERS[state.weatherId];
  const location = LOCATIONS[state.locationId];
  const sceneStatus = getSceneStatus(state.phase);
  const reelTarget = getReelTarget(state);
  const reelVisual: FishingReelVisual | null =
    state.phase === "reeling"
      ? {
          tension: state.reel.tension,
          progress: state.reel.progress,
          targetCenter: reelTarget.center,
          safeWidth: reelTarget.width,
        }
      : null;
  const visualCastPower = state.cast
    ? state.cast.power * 100
    : castPower;

  const baitOptions = BAIT_LIST.map((bait) => ({
    id: bait.id,
    name: bait.name,
    description: bait.description,
    stock: state.baitInventory[bait.id],
    icon: BAIT_ICONS[bait.id],
  }));
  const coolerPreview = state.cooler.map((fish) => ({
    id: fish.id,
    name: FISH_SPECIES[fish.speciesId].name,
    frame: fish.atlasFrame,
  }));

  return (
    <div className="app-stage">
      <div className="game-shell" data-status={state.status} data-phase={state.phase}>
        <Hud
          day={state.day}
          periodLabel={getPeriodLabel(castsUsed, state.dailyCastLimit)}
          weatherLabel={weather.name}
          weatherIcon={WEATHER_ICONS[state.weatherId]}
          money={state.money}
          level={state.level}
          levelProgress={levelProgress.ratio}
          reputation={state.reputation}
          castsUsed={castsUsed}
          castsPerDay={state.dailyCastLimit}
          soundEnabled={state.soundEnabled}
          paused={state.status === "paused"}
          onToggleSound={() => perform({ type: "TOGGLE_SOUND" }, false)}
          onTogglePause={() => perform({ type: "TOGGLE_PAUSE" })}
          onOpenSettings={() => {
            prepareOverlayOpen();
            playIfEnabled(playUiTap);
            setSettingsOpen(true);
          }}
        />

        <main className="game-body">
          <OrdersBoard state={state} onFulfillOrder={fulfillOrder} />

          <section className="playfield" aria-label="当前钓鱼场景">
            <GameCanvas
              phase={state.phase}
              castPower={visualCastPower}
              reel={reelVisual}
              fishFrame={state.currentCatch?.atlasFrame}
              weather={state.weatherId}
              paused={
                state.status !== "playing" ||
                !state.tutorialSeen ||
                blockingModalOpen
              }
              effectPulse={effectPulse}
              onPrimaryAction={handleCanvasPrimary}
            />

            <div className="scene-location">
              <HarborIcon name="map" size={20} />
              <span>
                <strong>{location.name}</strong>
                <small>{location.description}</small>
              </span>
            </div>

            <div className={`scene-status scene-status--${state.phase}`} aria-live="polite">
              <strong>{sceneStatus.title}</strong>
              <span>{sceneStatus.detail}</span>
            </div>

            {state.phase === "reeling" && reelVisual ? (
              <ReelMeter
                reel={reelVisual}
                targetMin={reelTarget.min}
                targetWidth={reelTarget.width}
              />
            ) : null}

            {state.status === "paused" ? (
              <div className="pause-curtain">
                <HarborIcon name="pause" size={38} />
                <strong>海风暂歇</strong>
                <span>点击上方播放按钮继续</span>
              </div>
            ) : null}
          </section>

          <GearWorkshop
            state={state}
            onBuyGear={buyGear}
            onSelectLocation={(locationId: LocationId) =>
              perform({ type: "SELECT_LOCATION", locationId })
            }
            onBuyBait={(baitId: BaitId) =>
              perform({ type: "BUY_BAIT", baitId })
            }
          />
        </main>

        <ActionBar
          baitOptions={baitOptions}
          selectedBaitId={state.selectedBaitId}
          phase={state.phase}
          castsRemaining={state.castsRemaining}
          castPower={castPower}
          isHolding={isHolding}
          reel={reelVisual}
          paused={state.status !== "playing"}
          coolerItems={coolerPreview}
          coolerCapacity={coolerCapacity}
          onSelectBait={(baitId) =>
            perform({ type: "SELECT_BAIT", baitId })
          }
          onPrimaryDown={beginPrimary}
          onPrimaryUp={endPrimary}
          onOpenCollection={() => {
            prepareOverlayOpen();
            playIfEnabled(playUiTap);
            setCollectionOpen(true);
          }}
          onOpenHarbor={() => {
            prepareOverlayOpen();
            playIfEnabled(playUiTap);
            setCoolerOpen(true);
          }}
        />

        <Toast
          toast={state.toast}
          onDismiss={() =>
            dispatch({ type: "DISMISS_TOAST", toastId: state.toast?.id })
          }
        />

        {!state.tutorialSeen ? (
          <TutorialOverlay
            step={tutorialStep}
            onNext={() => {
              if (tutorialStep >= 3) finishTutorial();
              else {
                playIfEnabled(playUiTap);
                setTutorialStep((current) => current + 1);
              }
            }}
            onSkip={finishTutorial}
          />
        ) : null}

        {state.phase === "caught" && state.currentCatch ? (
          <CatchModal
            fish={state.currentCatch}
            coolerCount={state.cooler.length}
            coolerCapacity={coolerCapacity}
            onStore={() => perform({ type: "STORE_CATCH" })}
            onSell={() => sellCatch()}
          />
        ) : null}

        {state.status === "dayEnd" && state.lastDaySummary ? (
          <DayEndModal
            summary={state.lastDaySummary}
            onContinue={() => perform({ type: "START_NEXT_DAY" })}
          />
        ) : null}

        {collectionOpen ? (
          <CollectionModal
            discovered={state.discoveredSpecies}
            bestWeights={state.bestWeights}
            onClose={() => setCollectionOpen(false)}
          />
        ) : null}

        {coolerOpen ? (
          <CoolerModal
            fish={state.cooler}
            capacity={coolerCapacity}
            onSell={(catchId) => sellCatch(catchId)}
            onSellAll={sellAll}
            onClose={() => setCoolerOpen(false)}
          />
        ) : null}

        {settingsOpen ? (
          <SettingsModal
            soundEnabled={state.soundEnabled}
            onToggleSound={() => dispatch({ type: "TOGGLE_SOUND" })}
            onClearSave={resetGame}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}
      </div>
      <p className="desktop-hint">按住空格甩竿 / 收线 · 点击水面可快速操作</p>
    </div>
  );
}
