import {
  BAIT_LIST,
  FISH_SPECIES,
  GEAR_LIST,
  LOCATION_LIST,
} from "../data/fishing";
import {
  canFulfillOrder,
  getGearUpgradeCost,
  getLocationUnlockState,
  getOrderProgress,
} from "../game/engine";
import type {
  BaitId,
  FishingOrder,
  GameState,
  GearId,
  LocationId,
} from "../game/types";
import {
  FishIcon,
  HarborIcon,
  type HarborIconName,
} from "./PixelIcon";

const GEAR_ICONS: Record<GearId, HarborIconName> = {
  rod: "rod",
  reel: "reel",
  cooler: "cooler",
  boat: "boat",
};

const BAIT_ICONS: Record<BaitId, HarborIconName> = {
  bread: "baitWorm",
  shrimp: "baitShrimp",
  "glow-worm": "baitLure",
};

export interface OrdersBoardProps {
  state: Pick<GameState, "cooler" | "orders" | "status">;
  onFulfillOrder: (orderId: string) => void;
}

function OrderArt({ order }: { order: FishingOrder }) {
  if (order.requirement.kind === "speciesCount") {
    const species = FISH_SPECIES[order.requirement.speciesId];
    return (
      <FishIcon
        className="order-card__fish"
        frame={species.atlasFrame}
        name={species.name}
        size={58}
      />
    );
  }

  return (
    <span className="order-card__symbol" aria-hidden="true">
      <HarborIcon
        name={order.requirement.kind === "totalWeight" ? "fish" : "star"}
        size={31}
      />
    </span>
  );
}

export function OrdersBoard({
  state,
  onFulfillOrder,
}: OrdersBoardProps) {
  return (
    <aside className="orders-board" aria-labelledby="orders-title">
      <header className="wood-sign-title">
        <span>
          <HarborIcon name="harbor" size={24} />
          <strong id="orders-title">今日订单</strong>
        </span>
        <small>留鱼交付，收益更高</small>
      </header>

      <div className="orders-list">
        {state.orders.map((order) => {
          const progress = getOrderProgress(state, order);
          const fulfillable = canFulfillOrder(state, order);
          return (
            <article
              className={[
                "order-card",
                order.fulfilled ? "is-fulfilled" : "",
                fulfillable ? "is-ready" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={order.id}
            >
              <OrderArt order={order} />
              <div className="order-card__body">
                <span className="order-card__customer">
                  {order.customerName}
                </span>
                <strong>{order.title}</strong>
                <p>{order.description}</p>
                <div className="order-progress">
                  <span
                    className="order-progress__track"
                    role="progressbar"
                    aria-label={`${order.title}完成进度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress.ratio * 100)}
                  >
                    <span style={{ width: `${progress.ratio * 100}%` }} />
                  </span>
                  <b>{progress.label}</b>
                </div>
              </div>
              <button
                className="order-card__action"
                type="button"
                disabled={
                  order.fulfilled ||
                  !fulfillable ||
                  state.status === "paused"
                }
                onClick={() => onFulfillOrder(order.id)}
              >
                {order.fulfilled ? (
                  <>
                    <HarborIcon name="check" size={16} />
                    已交付
                  </>
                ) : (
                  <>
                    <HarborIcon name="coin" size={16} />
                    {order.rewardCoins}
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>

      <footer className="orders-board__footer">
        <HarborIcon name="star" size={17} />
        订单还会带来经验和港口声望
      </footer>
    </aside>
  );
}

export interface GearWorkshopProps {
  state: Pick<
    GameState,
    | "gear"
    | "money"
    | "status"
    | "phase"
    | "locationId"
    | "baitInventory"
  >;
  onBuyGear: (gearId: GearId) => void;
  onSelectLocation: (locationId: LocationId) => void;
  onBuyBait: (baitId: BaitId) => void;
}

export function GearWorkshop({
  state,
  onBuyGear,
  onSelectLocation,
  onBuyBait,
}: GearWorkshopProps) {
  const canManage = state.status !== "paused" && state.phase === "idle";

  return (
    <aside className="gear-workshop" aria-labelledby="workshop-title">
      <header className="wood-sign-title">
        <span>
          <HarborIcon name="settings" size={24} />
          <strong id="workshop-title">装备工坊</strong>
        </span>
        <small>升级会永久保留</small>
      </header>

      <div className="gear-list">
        {GEAR_LIST.map((gear) => {
          const level = state.gear[gear.id];
          const upgradeCost = getGearUpgradeCost(state, gear.id);
          const maxed = upgradeCost === null;
          return (
            <article className="gear-row" key={gear.id}>
              <HarborIcon
                className={`gear-row__icon gear-row__icon--${gear.id}`}
                name={GEAR_ICONS[gear.id]}
                size={38}
              />
              <div className="gear-row__copy">
                <span>
                  <strong>{gear.name}</strong>
                  <b>Lv.{level}</b>
                </span>
                <p>{gear.benefitLabels[level - 1]}</p>
              </div>
              <button
                type="button"
                disabled={
                  !canManage ||
                  maxed ||
                  (upgradeCost !== null && state.money < upgradeCost)
                }
                onClick={() => onBuyGear(gear.id)}
              >
                {maxed ? (
                  <>
                    <HarborIcon name="check" size={15} />
                    满级
                  </>
                ) : (
                  <>
                    升级
                    <span>
                      <HarborIcon name="coin" size={14} />
                      {upgradeCost}
                    </span>
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>

      <section className="location-switcher" aria-labelledby="location-title">
        <div className="mini-section-title" id="location-title">
          <HarborIcon name="map" size={19} />
          选择钓点
        </div>
        <div className="location-list">
          {LOCATION_LIST.map((location) => {
            const unlock = getLocationUnlockState(state, location.id);
            return (
              <button
                className={unlock.selected ? "is-selected" : ""}
                type="button"
                key={location.id}
                disabled={!canManage || !unlock.unlocked}
                aria-pressed={unlock.selected}
                title={location.description}
                onClick={() => onSelectLocation(location.id)}
              >
                {!unlock.unlocked ? (
                  <HarborIcon name="lock" size={16} />
                ) : (
                  <HarborIcon name="anchor" size={16} />
                )}
                <span>{location.name}</span>
                {!unlock.unlocked ? <small>船 Lv.{location.requiredBoatLevel}</small> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="bait-supply" aria-labelledby="bait-supply-title">
        <div className="mini-section-title" id="bait-supply-title">
          <HarborIcon name="plus" size={18} />
          补给鱼饵
        </div>
        <div className="bait-supply__list">
          {BAIT_LIST.map((bait) => (
            <button
              type="button"
              key={bait.id}
              disabled={!canManage || state.money < bait.price}
              title={`${bait.description}，购买 1 份`}
              onClick={() => onBuyBait(bait.id)}
            >
              <HarborIcon name={BAIT_ICONS[bait.id]} size={20} />
              <span>
                {bait.name}
                <small>现有 {state.baitInventory[bait.id]}</small>
              </span>
              <b>
                <HarborIcon name="coin" size={13} />
                {bait.price}
              </b>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
