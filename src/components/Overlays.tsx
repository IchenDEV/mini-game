import type { DayStats, GameToast } from "../game/types";
import { PixelIcon, type PixelIconName } from "./PixelIcon";

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

function normalizeReputation(reputation: number) {
  return Math.min(5, Math.max(0, reputation > 5 ? reputation / 20 : reputation));
}

interface ModalShellProps {
  className?: string;
  labelledBy: string;
  children: React.ReactNode;
  onBackdropClick?: () => void;
}

function ModalShell({
  className,
  labelledBy,
  children,
  onBackdropClick,
}: ModalShellProps) {
  return (
    <div
      className="overlay-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onBackdropClick?.();
        }
      }}
    >
      <section
        className={["game-modal", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </section>
    </div>
  );
}

const TUTORIAL_STEPS: ReadonlyArray<{
  title: string;
  description: string;
  hint: string;
  icon: PixelIconName;
}> = [
  {
    title: "先备好今天的货",
    description: "打开「进货」，选择每种商品的数量。确认后，货物会送到仓库。",
    hint: "先少量采购，留些现金应对升级。",
    icon: "order",
  },
  {
    title: "把商品摆上货架",
    description: "仓库里的货还不能出售。打开「补货」，逐件补充或一键补满货架。",
    hint: "看到缺货提示时，要尽快补货。",
    icon: "restock",
  },
  {
    title: "照顾每一位顾客",
    description: "小动物会自己挑选商品并排队。缺货或等待太久都会降低口碑。",
    hint: "五颗爱心代表店铺口碑。",
    icon: "heart",
  },
  {
    title: "及时收银，持续升级",
    description: "顾客到达收银台后，及时完成结账。赚到的钱可以升级货架、收银和队列。",
    hint: "完成三天目标，成为金牌店长！",
    icon: "scanner",
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
  const isLastStep = safeStep === TUTORIAL_STEPS.length - 1;

  return (
    <ModalShell className="tutorial-modal" labelledBy="tutorial-title">
      <div className="tutorial-modal__art" aria-hidden="true">
        <span className="tutorial-modal__icon">
          <PixelIcon name={content.icon} size={58} />
        </span>
        <span className="tutorial-modal__spark tutorial-modal__spark--one">
          <PixelIcon name="star" size={16} />
        </span>
        <span className="tutorial-modal__spark tutorial-modal__spark--two">
          <PixelIcon name="star" size={11} />
        </span>
      </div>

      <div className="tutorial-modal__step">
        新手指南 {safeStep + 1}/{TUTORIAL_STEPS.length}
      </div>
      <h2 id="tutorial-title">{content.title}</h2>
      <p>{content.description}</p>
      <div className="tutorial-modal__hint">
        <PixelIcon name="acorn" size={18} />
        <span>{content.hint}</span>
      </div>

      <div
        className="tutorial-modal__progress"
        aria-label={`新手指南第 ${safeStep + 1} 步，共 ${TUTORIAL_STEPS.length} 步`}
      >
        {TUTORIAL_STEPS.map((tutorialStep, index) => (
          <span
            className={
              index === safeStep
                ? "tutorial-modal__dot tutorial-modal__dot--active"
                : "tutorial-modal__dot"
            }
            key={tutorialStep.title}
            aria-hidden="true"
          />
        ))}
      </div>

      <footer className="game-modal__actions">
        <button className="text-button" type="button" onClick={onSkip}>
          跳过指南
        </button>
        <button className="primary-button" type="button" onClick={onNext}>
          {isLastStep ? "开始营业" : "下一步"}
          <PixelIcon
            name={isLastStep ? "check" : "arrowRight"}
            size={18}
          />
        </button>
      </footer>
    </ModalShell>
  );
}

export interface DayEndModalProps {
  day: number;
  stats: DayStats;
  totalProfit: number;
  reputation: number;
  nextDayTarget?: number;
  onContinue: () => void;
}

export function DayEndModal({
  day,
  stats,
  totalProfit,
  reputation,
  nextDayTarget,
  onContinue,
}: DayEndModalProps) {
  const profit = stats.revenue - stats.costs;
  const reputationScore = normalizeReputation(reputation);
  const isFinalDay = day >= 3;

  return (
    <ModalShell className="day-end-modal" labelledBy="day-end-title">
      <header className="result-header">
        <span className="result-header__icon" aria-hidden="true">
          <PixelIcon name={profit >= 0 ? "star" : "reset"} size={44} />
        </span>
        <span>
          <span className="result-header__eyebrow">第 {day} 天打烊</span>
          <h2 id="day-end-title">
            {profit >= 0 ? "今天辛苦啦！" : "明天再加把劲"}
          </h2>
        </span>
      </header>

      <dl className="result-grid" aria-label="今日经营结算">
        <div className="result-stat">
          <dt>营业额</dt>
          <dd>¥{moneyFormatter.format(stats.revenue)}</dd>
        </div>
        <div className="result-stat">
          <dt>进货成本</dt>
          <dd>−¥{moneyFormatter.format(stats.costs)}</dd>
        </div>
        <div
          className={[
            "result-stat",
            "result-stat--featured",
            profit < 0 ? "result-stat--negative" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <dt>今日利润</dt>
          <dd>
            {profit < 0 ? "−" : "+"}¥{moneyFormatter.format(Math.abs(profit))}
          </dd>
        </div>
        <div className="result-stat">
          <dt>服务顾客</dt>
          <dd>{stats.served} 位</dd>
        </div>
        <div className="result-stat">
          <dt>流失顾客</dt>
          <dd>{stats.lost} 位</dd>
        </div>
        <div className="result-stat">
          <dt>售出商品</dt>
          <dd>{stats.itemsSold} 件</dd>
        </div>
      </dl>

      <div className="result-summary">
        <span>
          累计利润
          <strong>
            {totalProfit < 0 ? "−" : ""}¥
            {moneyFormatter.format(Math.abs(totalProfit))}
          </strong>
        </span>
        <span>
          当前口碑
          <strong>{reputationScore.toFixed(1)} / 5</strong>
        </span>
      </div>

      {nextDayTarget !== undefined && !isFinalDay ? (
        <p className="next-day-target">
          <PixelIcon name="target" size={19} />
          明日营业额目标：¥{moneyFormatter.format(nextDayTarget)}
        </p>
      ) : null}

      <footer className="game-modal__actions game-modal__actions--center">
        <button className="primary-button primary-button--wide" type="button" onClick={onContinue}>
          {isFinalDay ? "查看最终成绩" : `开始第 ${day + 1} 天`}
          <PixelIcon name="arrowRight" size={19} />
        </button>
      </footer>
    </ModalShell>
  );
}

export interface GameEndModalProps {
  totalProfit: number;
  reputation: number;
  totalRevenue: number;
  totalServed: number;
  totalLost: number;
  onRestart: () => void;
}

type GameOutcome = "win" | "steady" | "loss";

function getGameOutcome(
  totalProfit: number,
  reputation: number,
): {
  id: GameOutcome;
  title: string;
  message: string;
  icon: PixelIconName;
} {
  const reputationScore = normalizeReputation(reputation);

  if (totalProfit >= 600 && reputationScore >= 4) {
    return {
      id: "win",
      title: "金牌店长！",
      message: "三天经营大获成功，松果小市已经成为动物街最受欢迎的超市。",
      icon: "star",
    };
  }

  if (totalProfit >= 200 && reputationScore >= 2.5) {
    return {
      id: "steady",
      title: "小店站稳脚跟",
      message: "你顺利完成了三天试营业。再优化库存和收银节奏，就能创造更好的成绩。",
      icon: "acorn",
    };
  }

  return {
    id: "loss",
    title: "重新整装开店",
    message: "这次经营还没达到预期。少量多次进货、及时补货，会让现金和口碑更健康。",
    icon: "reset",
  };
}

export function GameEndModal({
  totalProfit,
  reputation,
  totalRevenue,
  totalServed,
  totalLost,
  onRestart,
}: GameEndModalProps) {
  const reputationScore = normalizeReputation(reputation);
  const outcome = getGameOutcome(totalProfit, reputation);

  return (
    <ModalShell
      className={`game-end-modal game-end-modal--${outcome.id}`}
      labelledBy="game-end-title"
    >
      <div className="game-end-modal__badge" aria-hidden="true">
        <PixelIcon name={outcome.icon} size={56} />
      </div>
      <span className="game-end-modal__eyebrow">三日经营挑战完成</span>
      <h2 id="game-end-title">{outcome.title}</h2>
      <p className="game-end-modal__message">{outcome.message}</p>

      <dl className="final-score" aria-label="三日经营总成绩">
        <div>
          <dt>累计营业额</dt>
          <dd>¥{moneyFormatter.format(totalRevenue)}</dd>
        </div>
        <div>
          <dt>累计利润</dt>
          <dd>
            {totalProfit < 0 ? "−" : ""}¥
            {moneyFormatter.format(Math.abs(totalProfit))}
          </dd>
        </div>
        <div>
          <dt>最终口碑</dt>
          <dd>{reputationScore.toFixed(1)} / 5</dd>
        </div>
        <div>
          <dt>服务 / 流失</dt>
          <dd>
            {totalServed} / {totalLost} 位
          </dd>
        </div>
      </dl>

      <footer className="game-modal__actions game-modal__actions--center">
        <button className="primary-button primary-button--wide" type="button" onClick={onRestart}>
          <PixelIcon name="reset" size={20} />
          重新挑战
        </button>
      </footer>
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
      className="settings-modal"
      labelledBy="settings-title"
      onBackdropClick={onClose}
    >
      <header className="settings-modal__header">
        <span>
          <span className="settings-modal__eyebrow">游戏选项</span>
          <h2 id="settings-title">设置</h2>
        </span>
        <button
          className="icon-button"
          type="button"
          aria-label="关闭设置"
          onClick={onClose}
        >
          <PixelIcon name="close" size={20} />
        </button>
      </header>

      <div className="settings-list">
        <div className="settings-row">
          <span className="settings-row__icon">
            <PixelIcon
              name={soundEnabled ? "soundOn" : "soundOff"}
              size={26}
            />
          </span>
          <span className="settings-row__copy">
            <strong>游戏音效</strong>
            <span>{soundEnabled ? "按钮与经营反馈音已开启" : "当前为静音模式"}</span>
          </span>
          <button
            className={[
              "toggle-button",
              soundEnabled ? "toggle-button--on" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            role="switch"
            aria-checked={soundEnabled}
            aria-label="游戏音效"
            onClick={onToggleSound}
          >
            <span className="toggle-button__thumb" aria-hidden="true" />
            <span className="sr-only">{soundEnabled ? "已开启" : "已关闭"}</span>
          </button>
        </div>

        <div className="settings-row settings-row--danger">
          <span className="settings-row__icon">
            <PixelIcon name="reset" size={26} />
          </span>
          <span className="settings-row__copy">
            <strong>重新开始</strong>
            <span>清除当前三天挑战的进度与存档</span>
          </span>
          <button
            className="danger-button"
            type="button"
            onClick={onClearSave}
          >
            清除存档
          </button>
        </div>
      </div>

      <footer className="game-modal__actions game-modal__actions--end">
        <button className="secondary-button" type="button" onClick={onClose}>
          返回游戏
        </button>
      </footer>
    </ModalShell>
  );
}

export interface ToastProps {
  toast: GameToast | null;
  onDismiss?: (toastId: number) => void;
}

const TOAST_ICONS: Record<GameToast["kind"], PixelIconName> = {
  success: "check",
  warning: "star",
  info: "acorn",
};

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div
      className="toast-region"
      aria-live={toast?.kind === "warning" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {toast ? (
        <div
          className={`game-toast game-toast--${toast.kind}`}
          role={toast.kind === "warning" ? "alert" : "status"}
        >
          <span className="game-toast__icon" aria-hidden="true">
            <PixelIcon name={TOAST_ICONS[toast.kind]} size={20} />
          </span>
          <span className="game-toast__message">{toast.message}</span>
          {onDismiss ? (
            <button
              className="game-toast__close"
              type="button"
              aria-label="关闭提示"
              onClick={() => onDismiss(toast.id)}
            >
              <PixelIcon name="close" size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
