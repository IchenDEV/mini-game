import { useRef } from "react";
import type { FishingReelVisual, FishingVisualPhase } from "../game/events";
import type { BaitId } from "../game/types";
import {
  FishIcon,
  HarborIcon,
  type HarborIconName,
} from "./PixelIcon";

export interface BaitOption {
  id: BaitId;
  name: string;
  description: string;
  stock: number;
  icon: HarborIconName;
}

export interface CoolerPreviewItem {
  id: string;
  name: string;
  frame: number;
}

export interface ActionBarProps {
  baitOptions: readonly BaitOption[];
  selectedBaitId: BaitId;
  phase: FishingVisualPhase;
  castsRemaining: number;
  castPower: number;
  isHolding: boolean;
  reel: FishingReelVisual | null;
  paused: boolean;
  coolerItems: readonly CoolerPreviewItem[];
  coolerCapacity: number;
  onSelectBait: (baitId: BaitId) => void;
  onPrimaryDown: () => void;
  onPrimaryUp: () => void;
  onOpenCollection: () => void;
  onOpenHarbor: () => void;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function getActionCopy(
  phase: FishingVisualPhase,
  castsRemaining: number,
  paused: boolean,
  isHolding: boolean,
): { label: string; hint: string; icon: HarborIconName } {
  if (paused) {
    return { label: "海面暂停了", hint: "点击上方继续", icon: "pause" };
  }

  switch (phase) {
    case "casting":
      return { label: "漂亮的抛线！", hint: "等待浮标落水", icon: "rod" };
    case "waiting":
      return { label: "安静等一等", hint: "留意浮标动静", icon: "fish" };
    case "bite":
      return { label: "现在！扬竿", hint: "快点一下，别让它跑掉", icon: "hook" };
    case "reeling":
      return {
        label: "按住收线",
        hint: "松开可降低张力",
        icon: "reel",
      };
    case "caught":
      return { label: "好鱼上船！", hint: "决定存入还是出售", icon: "sparkle" };
    case "idle":
    default:
      if (castsRemaining <= 0) {
        return {
          label: "今日收竿",
          hint: "先交订单，再结算今天",
          icon: "harbor",
        };
      }
      return {
        label: isHolding ? "松开甩竿" : "按住甩竿",
        hint: "蓄得越远，大鱼越容易出现",
        icon: "rod",
      };
  }
}

export function ActionBar({
  baitOptions,
  selectedBaitId,
  phase,
  castsRemaining,
  castPower,
  isHolding,
  reel,
  paused,
  coolerItems,
  coolerCapacity,
  onSelectBait,
  onPrimaryDown,
  onPrimaryUp,
  onOpenCollection,
  onOpenHarbor,
}: ActionBarProps) {
  const pointerActivationRef = useRef(false);
  const spaceActivationRef = useRef(false);
  const actionCopy = getActionCopy(
    phase,
    castsRemaining,
    paused,
    isHolding,
  );
  const safePower = clampPercent(castPower);
  const isInteractive =
    !paused && (phase === "idle" || phase === "bite" || phase === "reeling");
  const visibleCoolerItems = coolerItems.slice(0, 4);

  const releasePointer = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onPrimaryUp();
  };

  return (
    <nav className="action-dock" aria-label="钓鱼操作台">
      <section className="bait-tray" aria-labelledby="bait-tray-title">
        <div className="dock-section-title" id="bait-tray-title">
          鱼饵
          <span>选择后每次出竿消耗 1 份</span>
        </div>
        <div className="bait-list">
          {baitOptions.map((bait) => {
            const selected = selectedBaitId === bait.id;
            const unavailable = bait.stock <= 0;
            return (
              <button
                className={[
                  "bait-button",
                  selected ? "is-selected" : "",
                  unavailable ? "is-empty" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                key={bait.id}
                disabled={phase !== "idle" || paused}
                aria-pressed={selected}
                aria-label={`${bait.name}，剩余 ${bait.stock} 份。${bait.description}`}
                title={bait.description}
                onClick={() => onSelectBait(bait.id)}
              >
                <HarborIcon name={bait.icon} size={32} />
                <span>{bait.name}</span>
                <strong>{bait.stock}</strong>
              </button>
            );
          })}
        </div>
      </section>

      <section className="primary-action-wrap" aria-label="当前钓鱼动作">
        {phase === "idle" && castsRemaining > 0 ? (
          <div
            className="cast-power"
            role="progressbar"
            aria-label="甩竿蓄力"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(safePower)}
          >
            <span
              className="cast-power__fill"
              style={{ width: `${safePower}%` }}
            />
            <span
              className="cast-power__sweet-spot"
              aria-hidden="true"
            />
          </div>
        ) : null}

        {phase === "reeling" && reel ? (
          <div className="dock-reel-progress" aria-label="收线进度">
            <span>收线</span>
            <span className="dock-reel-progress__track">
              <span
                className="dock-reel-progress__fill"
                style={{ width: `${clampPercent(reel.progress)}%` }}
              />
            </span>
            <strong>{Math.round(reel.progress)}%</strong>
          </div>
        ) : null}

        <button
          className={[
            "primary-fishing-button",
            `phase-${phase}`,
            isHolding ? "is-held" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          disabled={!isInteractive}
          onPointerDown={(event) => {
            pointerActivationRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            onPrimaryDown();
          }}
          onPointerUp={(event) => {
            releasePointer(event);
            window.setTimeout(() => {
              pointerActivationRef.current = false;
            }, 0);
          }}
          onPointerCancel={(event) => {
            pointerActivationRef.current = false;
            releasePointer(event);
          }}
          onKeyDown={(event) => {
            if (event.repeat) return;
            if (event.key === "Enter") {
              event.preventDefault();
              onPrimaryDown();
              onPrimaryUp();
              return;
            }
            if (event.key !== " ") return;
            event.preventDefault();
            spaceActivationRef.current = true;
            onPrimaryDown();
          }}
          onKeyUp={(event) => {
            if (event.key !== " ") return;
            event.preventDefault();
            onPrimaryUp();
            window.setTimeout(() => {
              spaceActivationRef.current = false;
            }, 0);
          }}
          onClick={() => {
            if (
              pointerActivationRef.current ||
              spaceActivationRef.current
            ) {
              return;
            }
            onPrimaryDown();
            onPrimaryUp();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <HarborIcon name={actionCopy.icon} size={35} />
          <span>
            <strong>{actionCopy.label}</strong>
            <small>{actionCopy.hint}</small>
          </span>
        </button>
      </section>

      <section className="cooler-tray" aria-labelledby="cooler-tray-title">
        <div className="dock-section-title" id="cooler-tray-title">
          冷藏箱
          <span>
            {coolerItems.length}/{coolerCapacity}
          </span>
        </div>
        <div className="cooler-preview">
          {visibleCoolerItems.map((fish) => (
            <span className="cooler-preview__slot" key={fish.id}>
              <FishIcon frame={fish.frame} name={fish.name} size={48} />
            </span>
          ))}
          {Array.from(
            { length: Math.max(0, Math.min(4, coolerCapacity) - visibleCoolerItems.length) },
            (_, index) => (
              <span
                className="cooler-preview__slot cooler-preview__slot--empty"
                aria-hidden="true"
                key={`empty-${index}`}
              >
                +
              </span>
            ),
          )}
        </div>
      </section>

      <div className="dock-utilities" aria-label="港口功能">
        <button type="button" onClick={onOpenCollection}>
          <HarborIcon name="book" size={26} />
          <span>图鉴</span>
        </button>
        <button type="button" onClick={onOpenHarbor}>
          <HarborIcon name="harbor" size={27} />
          <span>鱼舱</span>
        </button>
      </div>
    </nav>
  );
}
