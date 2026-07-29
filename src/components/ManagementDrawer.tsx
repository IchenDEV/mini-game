import {
  PRODUCT_LIST,
  UPGRADE_CONFIG,
} from "../data/products";
import type {
  DrawerMode,
  Inventory,
  OrderDraft,
  ProductId,
  UpgradeId,
  UpgradeLevels,
} from "../game/types";
import {
  PixelIcon,
  ProductIcon,
  type PixelIconName,
} from "./PixelIcon";

export interface ManagementDrawerProps {
  mode: DrawerMode;
  money: number;
  shelves: Inventory;
  warehouse: Inventory;
  orderDraft: OrderDraft;
  upgrades: UpgradeLevels;
  shelfCapacity: number;
  onSetOrderQuantity: (productId: ProductId, quantity: number) => void;
  onConfirmOrder: () => void;
  onRestockOne: (productId: ProductId) => void;
  onRestockAll: (productId: ProductId) => void;
  onBuyUpgrade: (upgradeId: UpgradeId) => void;
  onClose?: () => void;
}

const MODE_CONTENT: Record<
  DrawerMode,
  { title: string; subtitle: string; icon: PixelIconName }
> = {
  order: {
    title: "进货单",
    subtitle: "采购商品，货物会先送到仓库",
    icon: "order",
  },
  restock: {
    title: "货架补货",
    subtitle: "从仓库把商品补到卖场货架",
    icon: "restock",
  },
  upgrade: {
    title: "店铺升级",
    subtitle: "投资设施，让每天经营更轻松",
    icon: "upgrade",
  },
};

const UPGRADE_IDS: readonly UpgradeId[] = [
  "shelf",
  "checkout",
  "patience",
];

const UPGRADE_ICONS: Record<UpgradeId, PixelIconName> = {
  shelf: "shelf",
  checkout: "scanner",
  patience: "heart",
};

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

function DrawerHeader({
  mode,
  onClose,
}: Pick<ManagementDrawerProps, "mode" | "onClose">) {
  const content = MODE_CONTENT[mode];

  return (
    <header className="management-drawer__header">
      <span className="management-drawer__header-icon" aria-hidden="true">
        <PixelIcon name={content.icon} size={30} />
      </span>
      <span className="management-drawer__heading">
        <h2 id="management-drawer-title">{content.title}</h2>
        <span>{content.subtitle}</span>
      </span>
      {onClose ? (
        <button
          className="icon-button management-drawer__close"
          type="button"
          aria-label="关闭管理面板"
          onClick={onClose}
        >
          <PixelIcon name="close" size={20} />
        </button>
      ) : null}
    </header>
  );
}

function QuantityControl({
  productId,
  productName,
  quantity,
  onChange,
}: {
  productId: ProductId;
  productName: string;
  quantity: number;
  onChange: (productId: ProductId, quantity: number) => void;
}) {
  const safeQuantity = Math.min(99, Math.max(0, quantity));

  return (
    <div className="quantity-control">
      <button
        className="quantity-control__button"
        type="button"
        disabled={safeQuantity === 0}
        aria-label={`减少一件${productName}`}
        onClick={() => onChange(productId, safeQuantity - 1)}
      >
        <PixelIcon name="minus" size={14} />
      </button>
      <input
        className="quantity-control__input"
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        value={safeQuantity}
        aria-label={`${productName}进货数量`}
        onChange={(event) => {
          const parsed = Number.parseInt(event.currentTarget.value, 10);
          onChange(
            productId,
            Number.isFinite(parsed) ? Math.min(99, Math.max(0, parsed)) : 0,
          );
        }}
      />
      <button
        className="quantity-control__button quantity-control__button--plus"
        type="button"
        disabled={safeQuantity >= 99}
        aria-label={`增加一件${productName}`}
        onClick={() => onChange(productId, safeQuantity + 1)}
      >
        <PixelIcon name="plus" size={14} />
      </button>
    </div>
  );
}

function OrderPanel({
  money,
  shelves,
  warehouse,
  orderDraft,
  onSetOrderQuantity,
  onConfirmOrder,
}: Pick<
  ManagementDrawerProps,
  | "money"
  | "shelves"
  | "warehouse"
  | "orderDraft"
  | "onSetOrderQuantity"
  | "onConfirmOrder"
>) {
  const totalCost = PRODUCT_LIST.reduce(
    (total, product) =>
      total + product.unitCost * Math.max(0, orderDraft[product.id]),
    0,
  );
  const totalUnits = PRODUCT_LIST.reduce(
    (total, product) => total + Math.max(0, orderDraft[product.id]),
    0,
  );
  const canAfford = totalCost <= money;

  return (
    <>
      <div className="management-list management-list--order">
        {PRODUCT_LIST.map((product) => {
          const currentStock =
            Math.max(0, shelves[product.id]) + Math.max(0, warehouse[product.id]);

          return (
            <article className="management-row product-order-row" key={product.id}>
              <ProductIcon productId={product.id} size={46} />
              <span className="management-row__main">
                <strong>{product.name}</strong>
                <span>
                  现有 {currentStock} 件
                  <span className="management-row__price">
                    ¥{product.unitCost}/件
                  </span>
                </span>
              </span>
              <QuantityControl
                productId={product.id}
                productName={product.name}
                quantity={orderDraft[product.id]}
                onChange={onSetOrderQuantity}
              />
            </article>
          );
        })}
      </div>

      <footer className="management-drawer__footer order-summary">
        <span className="order-summary__total">
          <span>合计 · {totalUnits} 件</span>
          <strong>¥{moneyFormatter.format(totalCost)}</strong>
        </span>
        {!canAfford ? (
          <span className="management-feedback management-feedback--warning" role="status">
            现金不足，还差 ¥{moneyFormatter.format(totalCost - money)}
          </span>
        ) : null}
        <button
          className="primary-button primary-button--wide"
          type="button"
          disabled={totalUnits === 0 || !canAfford}
          onClick={onConfirmOrder}
        >
          <PixelIcon name="check" size={20} />
          确认进货
        </button>
      </footer>
    </>
  );
}

function RestockPanel({
  shelves,
  warehouse,
  shelfCapacity,
  onRestockOne,
  onRestockAll,
}: Pick<
  ManagementDrawerProps,
  | "shelves"
  | "warehouse"
  | "shelfCapacity"
  | "onRestockOne"
  | "onRestockAll"
>) {
  const safeCapacity = Math.max(1, shelfCapacity);
  const warehouseUnits = PRODUCT_LIST.reduce(
    (total, product) => total + Math.max(0, warehouse[product.id]),
    0,
  );

  return (
    <>
      <div className="restock-summary">
        <PixelIcon name="warehouse" size={24} />
        <span>
          仓库共有 <strong>{warehouseUnits}</strong> 件商品
        </span>
      </div>

      <div className="management-list management-list--restock">
        {PRODUCT_LIST.map((product) => {
          const shelfStock = Math.max(0, shelves[product.id]);
          const warehouseStock = Math.max(0, warehouse[product.id]);
          const openShelfSlots = Math.max(0, safeCapacity - shelfStock);
          const restockableUnits = Math.min(warehouseStock, openShelfSlots);
          const shelfPercent = Math.min(100, (shelfStock / safeCapacity) * 100);
          const unavailableReason =
            warehouseStock === 0 ? "仓库无库存" : "货架已满";

          return (
            <article className="management-row restock-row" key={product.id}>
              <ProductIcon productId={product.id} size={46} />
              <span className="management-row__main restock-row__stock">
                <strong>{product.name}</strong>
                <span className="restock-row__numbers">
                  仓库 {warehouseStock}
                  <span aria-hidden="true"> · </span>
                  货架 {shelfStock}/{safeCapacity}
                </span>
                <span
                  className="stock-meter"
                  role="progressbar"
                  aria-label={`${product.name}货架库存`}
                  aria-valuemin={0}
                  aria-valuemax={safeCapacity}
                  aria-valuenow={shelfStock}
                >
                  <span
                    className={[
                      "stock-meter__fill",
                      shelfStock === 0 ? "stock-meter__fill--empty" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ width: `${shelfPercent}%` }}
                  />
                </span>
              </span>
              <span className="restock-row__actions">
                <button
                  className="secondary-button secondary-button--small"
                  type="button"
                  disabled={restockableUnits === 0}
                  title={restockableUnits === 0 ? unavailableReason : undefined}
                  aria-label={`给${product.name}货架补一件`}
                  onClick={() => onRestockOne(product.id)}
                >
                  +1
                </button>
                <button
                  className="secondary-button secondary-button--small"
                  type="button"
                  disabled={restockableUnits === 0}
                  title={restockableUnits === 0 ? unavailableReason : undefined}
                  aria-label={`补满${product.name}货架，最多补${restockableUnits}件`}
                  onClick={() => onRestockAll(product.id)}
                >
                  补满
                </button>
              </span>
            </article>
          );
        })}
      </div>
    </>
  );
}

function UpgradePanel({
  money,
  upgrades,
  onBuyUpgrade,
}: Pick<
  ManagementDrawerProps,
  "money" | "upgrades" | "onBuyUpgrade"
>) {
  return (
    <div className="management-list management-list--upgrades">
      {UPGRADE_IDS.map((upgradeId) => {
        const config = UPGRADE_CONFIG[upgradeId];
        const level = Math.min(config.maxLevel, Math.max(0, upgrades[upgradeId]));
        const isMaxLevel = level >= config.maxLevel;
        const nextCost = isMaxLevel ? null : config.costs[level];
        const canAfford = nextCost !== null && money >= nextCost;

        return (
          <article className="upgrade-card" key={upgradeId}>
            <span className={`upgrade-card__icon upgrade-card__icon--${upgradeId}`}>
              <PixelIcon name={UPGRADE_ICONS[upgradeId]} size={34} />
            </span>
            <span className="upgrade-card__content">
              <span className="upgrade-card__title-row">
                <strong>{config.name}</strong>
                <span className="upgrade-level" aria-label={`当前 ${level} 级，最高 ${config.maxLevel} 级`}>
                  {Array.from({ length: config.maxLevel }, (_, index) => (
                    <span
                      className={
                        index < level
                          ? "upgrade-level__pip upgrade-level__pip--filled"
                          : "upgrade-level__pip"
                      }
                      key={index}
                      aria-hidden="true"
                    />
                  ))}
                </span>
              </span>
              <span className="upgrade-card__description">
                {config.description}
              </span>
            </span>
            <button
              className="primary-button upgrade-card__button"
              type="button"
              disabled={isMaxLevel || !canAfford}
              title={
                isMaxLevel
                  ? "已升至最高等级"
                  : !canAfford
                    ? `还差 ¥${moneyFormatter.format((nextCost ?? 0) - money)}`
                    : undefined
              }
              onClick={() => onBuyUpgrade(upgradeId)}
            >
              {isMaxLevel ? (
                <>
                  <PixelIcon name="star" size={16} />
                  已满级
                </>
              ) : (
                <>
                  <PixelIcon name="coin" size={16} />
                  ¥{moneyFormatter.format(nextCost ?? 0)}
                </>
              )}
            </button>
          </article>
        );
      })}
    </div>
  );
}

export function ManagementDrawer(props: ManagementDrawerProps) {
  return (
    <aside
      className={`management-drawer management-drawer--${props.mode}`}
      aria-labelledby="management-drawer-title"
    >
      <DrawerHeader mode={props.mode} onClose={props.onClose} />
      <div className="management-drawer__body">
        {props.mode === "order" ? (
          <OrderPanel
            money={props.money}
            shelves={props.shelves}
            warehouse={props.warehouse}
            orderDraft={props.orderDraft}
            onSetOrderQuantity={props.onSetOrderQuantity}
            onConfirmOrder={props.onConfirmOrder}
          />
        ) : null}
        {props.mode === "restock" ? (
          <RestockPanel
            shelves={props.shelves}
            warehouse={props.warehouse}
            shelfCapacity={props.shelfCapacity}
            onRestockOne={props.onRestockOne}
            onRestockAll={props.onRestockAll}
          />
        ) : null}
        {props.mode === "upgrade" ? (
          <UpgradePanel
            money={props.money}
            upgrades={props.upgrades}
            onBuyUpgrade={props.onBuyUpgrade}
          />
        ) : null}
      </div>
    </aside>
  );
}
