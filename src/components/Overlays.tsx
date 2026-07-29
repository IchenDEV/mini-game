import { useEffect, useRef, type ReactNode } from "react";
import {
  FISH_SPECIES,
  FISH_SPECIES_LIST,
  LOCATIONS,
  RARITY_LABEL,
  WEATHERS,
} from "../data/fishing";
import type {
  CaughtFish,
  DaySummary,
  FishSpeciesId,
  GameToast,
} from "../game/types";
import { FishIcon, HarborIcon, type HarborIconName } from "./PixelIcon";

interface ModalShellProps {
  labelledBy: string;
  className?: string;
  children: ReactNode;
  onClose?: () => void;
}

function ModalShell({
  labelledBy,
  className,
  children,
  onClose,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirst = window.requestAnimationFrame(() => {
      const firstFocusable =
        dialog?.querySelector<HTMLElement>(focusableSelector);
      (firstFocusable ?? dialog)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFirst);
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="overlay-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className={["game-modal", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}

const TUTORIAL_STEPS: ReadonlyArray<{
  title: string;
  description: string;
  tip: string;
  icon: HarborIconName;
}> = [
  {
    title: "选好鱼饵，准备出海",
    description: "海蚯蚓适合常见鱼，鲜虾和星光虫更容易引来稀有渔获。",
    tip: "右侧补给架可以随时购买鱼饵。",
    icon: "baitShrimp",
  },
  {
    title: "按住蓄力，松开甩竿",
    description: "蓄力条进入黄色区域时松手，浮标会落到鱼群更活跃的水域。",
    tip: "也可以点击水面，用固定力度快速出竿。",
    icon: "rod",
  },
  {
    title: "看到叹号，马上扬竿",
    description: "中鱼后按住收线、松开降张力。让指针留在绿色安全区，进度满了就能起鱼。",
    tip: "卷线器升级后，安全区会明显变宽。",
    icon: "reel",
  },
  {
    title: "留鱼交订单，赚得更多",
    description: "渔获可以立刻出售，也能放进冷藏箱等待高价订单。金币用于装备和渔船升级。",
    tip: "升级渔船会解锁珊瑚礁与月光深海。",
    icon: "harbor",
  },
];

export interface TutorialOverlayProps {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

export function TutorialOverlay({
  step,
  onNext,
  onSkip,
}: TutorialOverlayProps) {
  const safeStep = Math.min(
    TUTORIAL_STEPS.length - 1,
    Math.max(0, Math.floor(step)),
  );
  const content = TUTORIAL_STEPS[safeStep];
  const last = safeStep === TUTORIAL_STEPS.length - 1;

  return (
    <ModalShell labelledBy="tutorial-title" className="tutorial-modal">
      <div className="tutorial-modal__illustration" aria-hidden="true">
        <HarborIcon name={content.icon} size={72} />
        <span className="tutorial-water-line" />
      </div>
      <div className="tutorial-modal__count">
        {safeStep + 1} / {TUTORIAL_STEPS.length}
      </div>
      <h2 id="tutorial-title">{content.title}</h2>
      <p>{content.description}</p>
      <div className="tutorial-modal__tip">
        <HarborIcon name="sparkle" size={18} />
        {content.tip}
      </div>
      <div className="tutorial-modal__steps" aria-hidden="true">
        {TUTORIAL_STEPS.map((item, index) => (
          <span className={index <= safeStep ? "is-active" : ""} key={item.title} />
        ))}
      </div>
      <footer className="game-modal__actions">
        <button className="quiet-action" type="button" onClick={onSkip}>
          跳过指南
        </button>
        <button className="primary-action" type="button" onClick={onNext}>
          {last ? "开始第一竿" : "下一步"}
          <HarborIcon name={last ? "check" : "arrowRight"} size={18} />
        </button>
      </footer>
    </ModalShell>
  );
}

export interface CatchModalProps {
  fish: CaughtFish;
  coolerCount: number;
  coolerCapacity: number;
  onStore: () => void;
  onSell: () => void;
}

export function CatchModal({
  fish,
  coolerCount,
  coolerCapacity,
  onStore,
  onSell,
}: CatchModalProps) {
  const species = FISH_SPECIES[fish.speciesId];
  const coolerFull = coolerCount >= coolerCapacity;

  return (
    <ModalShell labelledBy="catch-title" className="catch-modal">
      <div className="catch-modal__burst" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="catch-modal__fish">
        <FishIcon frame={fish.atlasFrame} name={species.name} size={230} />
      </div>
      <div className="catch-modal__copy">
        <span className={`rarity-label rarity-${fish.rarity}`}>
          {RARITY_LABEL[fish.rarity]}
          {fish.isTrophy ? " · 新纪录" : ""}
        </span>
        <h2 id="catch-title">{species.name}</h2>
        <p>{species.description}</p>
        <dl className="catch-stats">
          <div>
            <dt>重量</dt>
            <dd>{fish.weight.toFixed(2)} kg</dd>
          </div>
          <div>
            <dt>码头价</dt>
            <dd>
              <HarborIcon name="coin" size={18} />
              {fish.value}
            </dd>
          </div>
        </dl>
      </div>
      <footer className="catch-modal__actions">
        <button
          className="store-catch-action"
          type="button"
          disabled={coolerFull}
          onClick={onStore}
        >
          <HarborIcon name="cooler" size={24} />
          <span>
            放入冷藏箱
            <small>
              {coolerFull
                ? "容量已满"
                : `${coolerCount + 1}/${coolerCapacity} · 可交订单`}
            </small>
          </span>
        </button>
        <button className="sell-catch-action" type="button" onClick={onSell}>
          立即卖出
          <strong>
            <HarborIcon name="coin" size={17} />
            {fish.value}
          </strong>
        </button>
      </footer>
    </ModalShell>
  );
}

export interface DayEndModalProps {
  summary: DaySummary;
  onContinue: () => void;
}

export function DayEndModal({
  summary,
  onContinue,
}: DayEndModalProps) {
  const weather = WEATHERS[summary.weatherId];
  const location = LOCATIONS[summary.locationId];

  return (
    <ModalShell labelledBy="day-end-title" className="day-end-modal">
      <header className="day-end-header">
        <HarborIcon name="sun" size={43} />
        <span>
          <small>第 {summary.day} 天收竿</small>
          <h2 id="day-end-title">今天的海风很慷慨</h2>
        </span>
      </header>
      <p className="day-end-location">
        {location.name} · {weather.name}
      </p>
      <dl className="day-results">
        <div>
          <dt>捕获</dt>
          <dd>{summary.stats.caught} 条</dd>
        </div>
        <div>
          <dt>总重</dt>
          <dd>{summary.stats.totalWeight.toFixed(1)} kg</dd>
        </div>
        <div>
          <dt>今日收入</dt>
          <dd>{summary.stats.revenue}</dd>
        </div>
        <div>
          <dt>完成订单</dt>
          <dd>{summary.stats.ordersFulfilled} 份</dd>
        </div>
        <div>
          <dt>最重渔获</dt>
          <dd>{summary.stats.heaviestCatch.toFixed(2)} kg</dd>
        </div>
        <div>
          <dt>获得经验</dt>
          <dd>+{summary.stats.xpEarned}</dd>
        </div>
      </dl>
      <div className="day-end-balance">
        <span>带回港口</span>
        <strong>
          <HarborIcon name="coin" size={22} />
          {summary.endingMoney}
        </strong>
        <small>鱼舱还留有 {summary.coolerCount} 条鱼</small>
      </div>
      <footer className="game-modal__actions game-modal__actions--center">
        <button className="primary-action" type="button" onClick={onContinue}>
          迎接第 {summary.day + 1} 天
          <HarborIcon name="arrowRight" size={18} />
        </button>
      </footer>
    </ModalShell>
  );
}

export interface CollectionModalProps {
  discovered: readonly FishSpeciesId[];
  bestWeights: Partial<Record<FishSpeciesId, number>>;
  onClose: () => void;
}

export function CollectionModal({
  discovered,
  bestWeights,
  onClose,
}: CollectionModalProps) {
  const discoveredSet = new Set(discovered);

  return (
    <ModalShell
      labelledBy="collection-title"
      className="collection-modal"
      onClose={onClose}
    >
      <header className="modal-heading">
        <span>
          <HarborIcon name="book" size={29} />
          <h2 id="collection-title">海洋图鉴</h2>
        </span>
        <button type="button" aria-label="关闭图鉴" onClick={onClose}>
          <HarborIcon name="close" size={21} />
        </button>
      </header>
      <p className="collection-intro">
        已发现 {discovered.length}/{FISH_SPECIES_LIST.length} 种。升级渔船，驶向更远的水域。
      </p>
      <div className="collection-grid">
        {FISH_SPECIES_LIST.map((species) => {
          const found = discoveredSet.has(species.id);
          return (
            <article className={found ? "is-found" : "is-hidden"} key={species.id}>
              <div className="collection-fish">
                <FishIcon
                  frame={species.atlasFrame}
                  name={found ? species.name : "未发现鱼种"}
                  size={108}
                />
                {!found ? <HarborIcon name="lock" size={25} /> : null}
              </div>
              <span className={`rarity-label rarity-${species.rarity}`}>
                {found ? RARITY_LABEL[species.rarity] : "未发现"}
              </span>
              <strong>{found ? species.name : "？？？"}</strong>
              <p>{found ? species.description : "海图上还没有它的记录。"}</p>
              <small>
                最佳纪录：
                {found && bestWeights[species.id]
                  ? `${bestWeights[species.id]?.toFixed(2)} kg`
                  : "--"}
              </small>
            </article>
          );
        })}
      </div>
    </ModalShell>
  );
}

export interface CoolerModalProps {
  fish: readonly CaughtFish[];
  capacity: number;
  onSell: (catchId: string) => void;
  onSellAll: () => void;
  onClose: () => void;
}

export function CoolerModal({
  fish,
  capacity,
  onSell,
  onSellAll,
  onClose,
}: CoolerModalProps) {
  const totalValue = fish.reduce((sum, item) => sum + item.value, 0);

  return (
    <ModalShell
      labelledBy="cooler-title"
      className="cooler-modal"
      onClose={onClose}
    >
      <header className="modal-heading">
        <span>
          <HarborIcon name="cooler" size={29} />
          <h2 id="cooler-title">冷藏鱼舱</h2>
        </span>
        <button type="button" aria-label="关闭鱼舱" onClick={onClose}>
          <HarborIcon name="close" size={21} />
        </button>
      </header>
      <div className="cooler-modal__summary">
        <span>
          已用 <strong>{fish.length}/{capacity}</strong>
        </span>
        <span>
          即时售价 <strong>{totalValue}</strong>
        </span>
        <button type="button" disabled={fish.length === 0} onClick={onSellAll}>
          全部卖出
        </button>
      </div>
      {fish.length === 0 ? (
        <div className="cooler-empty">
          <HarborIcon name="fish" size={46} />
          <strong>鱼舱还是空的</strong>
          <span>去海面甩出今天的第一竿吧。</span>
        </div>
      ) : (
        <div className="cooler-list">
          {fish.map((item) => {
            const species = FISH_SPECIES[item.speciesId];
            return (
              <article key={item.id}>
                <FishIcon frame={item.atlasFrame} name={species.name} size={84} />
                <span>
                  <small>{RARITY_LABEL[item.rarity]}</small>
                  <strong>{species.name}</strong>
                  <b>{item.weight.toFixed(2)} kg</b>
                </span>
                <button type="button" onClick={() => onSell(item.id)}>
                  卖出
                  <strong>
                    <HarborIcon name="coin" size={15} />
                    {item.value}
                  </strong>
                </button>
              </article>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}

export interface SettingsModalProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  onClearSave: () => void;
  onClose: () => void;
}

export function SettingsModal({
  soundEnabled,
  onToggleSound,
  onClearSave,
  onClose,
}: SettingsModalProps) {
  return (
    <ModalShell
      labelledBy="settings-title"
      className="settings-modal"
      onClose={onClose}
    >
      <header className="modal-heading">
        <span>
          <HarborIcon name="settings" size={28} />
          <h2 id="settings-title">游戏设置</h2>
        </span>
        <button type="button" aria-label="关闭设置" onClick={onClose}>
          <HarborIcon name="close" size={21} />
        </button>
      </header>
      <div className="settings-row">
        <HarborIcon name={soundEnabled ? "soundOn" : "soundOff"} size={28} />
        <span>
          <strong>游戏音效</strong>
          <small>{soundEnabled ? "水花、收线与金币反馈已开启" : "当前保持安静"}</small>
        </span>
        <button
          className={soundEnabled ? "is-on" : ""}
          type="button"
          role="switch"
          aria-checked={soundEnabled}
          onClick={onToggleSound}
        >
          <span />
          {soundEnabled ? "开启" : "关闭"}
        </button>
      </div>
      <div className="settings-danger">
        <span>
          <strong>重新开始</strong>
          <small>清除本机存档，金币、图鉴与升级都会重置。</small>
        </span>
        <button type="button" onClick={onClearSave}>
          清除存档
        </button>
      </div>
    </ModalShell>
  );
}

export interface ToastProps {
  toast: GameToast | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null;
  const icon: HarborIconName =
    toast.kind === "success"
      ? "check"
      : toast.kind === "warning"
        ? "hook"
        : "sparkle";

  return (
    <button
      className={`game-toast game-toast--${toast.kind}`}
      type="button"
      role="status"
      onClick={onDismiss}
    >
      <HarborIcon name={icon} size={20} />
      <span>{toast.message}</span>
      <HarborIcon name="close" size={15} />
    </button>
  );
}
