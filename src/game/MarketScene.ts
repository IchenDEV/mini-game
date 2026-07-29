import Phaser from "phaser";
import { PRODUCTS, SPECIES } from "../data/products";
import { gameEvents } from "./events";
import type { Customer, ProductId, SalePulse } from "./types";

export const GAME_WIDTH = 1000;
export const GAME_HEIGHT = 563;

const BACKGROUND_KEY = "market-background";
const CUSTOMER_ATLAS_KEY = "customer-atlas";
const PRODUCT_ATLAS_KEY = "product-atlas";
const COIN_TEXTURE_KEY = "sale-coin";
const BACKGROUND_CROP = { x: 0, y: 0, width: 1555, height: 941 } as const;

const ENTRY_START = new Phaser.Math.Vector2(-54, 382);
const ENTRY_POINT = new Phaser.Math.Vector2(112, 360);
const EXIT_POINT = new Phaser.Math.Vector2(-64, 386);
const CHECKOUT_POINT = new Phaser.Math.Vector2(252, 414);

const QUEUE_POINTS = [
  new Phaser.Math.Vector2(305, 431),
  new Phaser.Math.Vector2(370, 431),
  new Phaser.Math.Vector2(435, 431),
  new Phaser.Math.Vector2(500, 431),
  new Phaser.Math.Vector2(565, 431),
  new Phaser.Math.Vector2(630, 431),
] as const;

interface CustomerVisual {
  customer: Customer;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  thoughtBubble: Phaser.GameObjects.Graphics;
  thoughtProduct: Phaser.GameObjects.Sprite;
  patienceBar: Phaser.GameObjects.Graphics;
  moodText: Phaser.GameObjects.Text;
  targetKey: string;
  bobOffset: number;
}

interface CustomerTarget {
  key: string;
  x: number;
  y: number;
}

export class MarketScene extends Phaser.Scene {
  private readonly customerVisuals = new Map<string, CustomerVisual>();
  private eventUnsubscribers: Array<() => void> = [];
  private pauseCurtain?: Phaser.GameObjects.Rectangle;
  private pauseLabel?: Phaser.GameObjects.Text;
  private checkoutHitArea?: Phaser.GameObjects.Zone;
  private checkoutOutline?: Phaser.GameObjects.Graphics;
  private checkoutPrompt?: Phaser.GameObjects.Text;
  private cleanedUp = false;
  private pausedByReact = false;
  private lastSaleId: number | null = null;

  constructor() {
    super({ key: "MarketScene" });
  }

  preload(): void {
    this.load.image(
      BACKGROUND_KEY,
      "/assets/game/market-background.png",
    );
    this.load.spritesheet(
      CUSTOMER_ATLAS_KEY,
      "/assets/game/customer-atlas.png",
      {
        frameWidth: 512,
        frameHeight: 512,
      },
    );
    this.load.spritesheet(
      PRODUCT_ATLAS_KEY,
      "/assets/game/product-atlas.png",
      {
        frameWidth: 512,
        frameHeight: 512,
      },
    );
  }

  create(): void {
    this.cleanedUp = false;
    this.textures
      .get(CUSTOMER_ATLAS_KEY)
      .setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures
      .get(PRODUCT_ATLAS_KEY)
      .setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures
      .get(BACKGROUND_KEY)
      .setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.add
      .image(0, 0, BACKGROUND_KEY)
      .setOrigin(0)
      .setCrop(
        BACKGROUND_CROP.x,
        BACKGROUND_CROP.y,
        BACKGROUND_CROP.width,
        BACKGROUND_CROP.height,
      )
      .setScale(
        GAME_WIDTH / BACKGROUND_CROP.width,
        GAME_HEIGHT / BACKGROUND_CROP.height,
      )
      .setDepth(0);

    this.createCoinTexture();
    this.createCheckoutControl();
    this.createPauseCurtain();
    this.bindEvents();

    const customers = gameEvents.getCustomers();
    if (customers) {
      this.syncCustomers(customers);
    }
    this.setPaused(gameEvents.getPaused() ?? false);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanUp, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanUp, this);
  }

  update(time: number): void {
    if (this.pausedByReact) {
      return;
    }

    for (const visual of this.customerVisuals.values()) {
      visual.sprite.y =
        Math.sin(time / 180 + visual.bobOffset) * 1.8;
      visual.container.setDepth(100 + Math.round(visual.container.y));
    }
  }

  private bindEvents(): void {
    this.eventUnsubscribers.push(
      gameEvents.on("customers:sync", (customers) => {
        this.syncCustomers(customers);
      }),
      gameEvents.on("sale:pulse", (sale) => {
        this.showSale(sale);
      }),
      gameEvents.on("game:paused", (paused) => {
        this.setPaused(paused);
      }),
    );
  }

  private createCheckoutControl(): void {
    this.checkoutOutline = this.add
      .graphics()
      .setDepth(760)
      .setAlpha(0.72);
    this.drawCheckoutOutline(false);

    this.checkoutPrompt = this.add
      .text(194, 356, "点击收银", {
        fontFamily: '"Courier New", monospace',
        fontSize: "17px",
        fontStyle: "bold",
        color: "#3c3044",
        backgroundColor: "#fff2c7",
        padding: { x: 10, y: 6 },
        stroke: "#ffffff",
        strokeThickness: 1,
        shadow: {
          offsetX: 2,
          offsetY: 2,
          color: "#593f48",
          blur: 0,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(761);

    this.checkoutHitArea = this.add
      .zone(195, 414, 182, 112)
      .setDepth(762)
      .setInteractive({ useHandCursor: true });

    this.checkoutHitArea.on("pointerover", () => {
      this.drawCheckoutOutline(true);
      this.checkoutPrompt?.setScale(1.05);
    });
    this.checkoutHitArea.on("pointerout", () => {
      this.drawCheckoutOutline(false);
      this.checkoutPrompt?.setScale(1);
    });
    this.checkoutHitArea.on("pointerdown", () => {
      if (this.pausedByReact) {
        return;
      }

      this.cameras.main.shake(65, 0.0012);
      this.checkoutPrompt?.setText("叮！收银");
      this.time.delayedCall(240, () => {
        this.checkoutPrompt?.setText("点击收银");
      });
      gameEvents.emit("checkout:request");
    });

    this.tweens.add({
      targets: this.checkoutPrompt,
      y: 352,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  private drawCheckoutOutline(isHovering: boolean): void {
    if (!this.checkoutOutline) {
      return;
    }

    this.checkoutOutline.clear();
    this.checkoutOutline.fillStyle(
      isHovering ? 0xffdb67 : 0xfff0ad,
      isHovering ? 0.18 : 0.08,
    );
    this.checkoutOutline.fillRoundedRect(105, 363, 180, 108, 12);
    this.checkoutOutline.lineStyle(
      isHovering ? 4 : 3,
      isHovering ? 0xffc43d : 0xffe39a,
      1,
    );
    this.checkoutOutline.strokeRoundedRect(105, 363, 180, 108, 12);
  }

  private createPauseCurtain(): void {
    this.pauseCurtain = this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0x24314b,
        0.42,
      )
      .setDepth(1800)
      .setVisible(false);
    this.pauseLabel = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "营业暂停", {
        fontFamily: '"Courier New", monospace',
        fontSize: "32px",
        fontStyle: "bold",
        color: "#fff5cf",
        backgroundColor: "#493f66",
        padding: { x: 22, y: 12 },
        stroke: "#2c263e",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(1801)
      .setVisible(false);
  }

  private createCoinTexture(): void {
    if (this.textures.exists(COIN_TEXTURE_KEY)) {
      return;
    }

    const coin = this.add.graphics();
    coin.fillStyle(0x8b5520, 1);
    coin.fillRect(0, 2, 10, 7);
    coin.fillStyle(0xffc83d, 1);
    coin.fillRect(1, 1, 8, 8);
    coin.fillStyle(0xffec85, 1);
    coin.fillRect(3, 2, 4, 5);
    coin.generateTexture(COIN_TEXTURE_KEY, 10, 10);
    coin.destroy();
  }

  private syncCustomers(customers: Customer[]): void {
    const incomingIds = new Set(customers.map((customer) => customer.id));

    for (const [id, visual] of this.customerVisuals) {
      if (!incomingIds.has(id)) {
        this.removeCustomerVisual(id, visual);
      }
    }

    const queue = customers
      .filter((customer) => customer.phase === "queue")
      .sort((left, right) => {
        const leftJoined = left.joinedQueueAt ?? Number.MAX_SAFE_INTEGER;
        const rightJoined = right.joinedQueueAt ?? Number.MAX_SAFE_INTEGER;
        return leftJoined - rightJoined;
      });
    const queueIndexById = new Map(
      queue.map((customer, index) => [customer.id, index]),
    );

    for (const customer of customers) {
      let visual = this.customerVisuals.get(customer.id);
      if (!visual) {
        visual = this.createCustomerVisual(customer);
        this.customerVisuals.set(customer.id, visual);
      }

      visual.customer = customer;
      this.updateCustomerUi(visual);
      const target = this.getCustomerTarget(
        customer,
        queueIndexById.get(customer.id),
      );
      this.moveCustomer(visual, target);
    }
  }

  private createCustomerVisual(customer: Customer): CustomerVisual {
    const container = this.add.container(
      ENTRY_START.x,
      ENTRY_START.y,
    );
    const shadow = this.add
      .ellipse(0, 38, 68, 19, 0x3c3b4b, 0.2)
      .setStrokeStyle(2, 0xffffff, 0.15);
    const sprite = this.add
      .sprite(
        0,
        0,
        CUSTOMER_ATLAS_KEY,
        SPECIES[customer.species].atlasFrame,
      )
      .setDisplaySize(164, 164);

    const patienceBar = this.add.graphics();
    const thoughtBubble = this.add.graphics();
    const initialProduct = this.getThoughtProduct(customer);
    const thoughtProduct = this.add
      .sprite(
        0,
        -84,
        PRODUCT_ATLAS_KEY,
        PRODUCTS[initialProduct].atlasFrame,
      )
      .setDisplaySize(38, 38);
    const moodText = this.add
      .text(38, -52, "!", {
        fontFamily: '"Courier New", monospace',
        fontSize: "20px",
        fontStyle: "bold",
        color: "#d94b51",
        backgroundColor: "#fff7dc",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    container.add([
      shadow,
      sprite,
      patienceBar,
      thoughtBubble,
      thoughtProduct,
      moodText,
    ]);
    container.setScale(0.94);
    container.setAlpha(0);
    container.setDepth(100 + ENTRY_START.y);

    return {
      customer,
      container,
      sprite,
      thoughtBubble,
      thoughtProduct,
      patienceBar,
      moodText,
      targetKey: "",
      bobOffset: Phaser.Math.FloatBetween(0, Math.PI * 2),
    };
  }

  private updateCustomerUi(visual: CustomerVisual): void {
    const { customer } = visual;
    const isShopping = customer.phase === "shopping";
    const isWaiting =
      customer.phase === "queue" || customer.phase === "entering";
    const isUpset =
      customer.phase === "upset" ||
      customer.patience <= 20 ||
      customer.missedItems > 0;

    visual.sprite
      .setFrame(SPECIES[customer.species].atlasFrame)
      .setTint(
        customer.phase === "upset" ? 0xffb8b8 : 0xffffff,
      );

    visual.thoughtBubble.setVisible(isShopping);
    visual.thoughtProduct.setVisible(isShopping);
    if (isShopping) {
      const product = this.getThoughtProduct(customer);
      visual.thoughtProduct.setFrame(PRODUCTS[product].atlasFrame);
      this.drawThoughtBubble(visual.thoughtBubble);
    }

    visual.moodText.setVisible(isUpset);
    visual.moodText.setText(customer.phase === "upset" ? "×" : "!");
    this.drawPatienceBar(
      visual.patienceBar,
      customer.patience,
      isWaiting || isShopping,
    );
  }

  private drawThoughtBubble(
    bubble: Phaser.GameObjects.Graphics,
  ): void {
    bubble.clear();
    bubble.fillStyle(0x4c4055, 0.32);
    bubble.fillRoundedRect(-25, -106, 53, 46, 13);
    bubble.fillStyle(0xfff9e9, 1);
    bubble.fillRoundedRect(-27, -108, 53, 46, 13);
    bubble.fillTriangle(-8, -63, 2, -63, -3, -55);
    bubble.lineStyle(2, 0x6e5a75, 0.92);
    bubble.strokeRoundedRect(-27, -108, 53, 46, 13);
  }

  private drawPatienceBar(
    bar: Phaser.GameObjects.Graphics,
    patience: number,
    visible: boolean,
  ): void {
    bar.clear();
    bar.setVisible(visible);
    if (!visible) {
      return;
    }

    const normalizedPatience = Phaser.Math.Clamp(patience, 0, 100) / 100;
    const color =
      normalizedPatience > 0.55
        ? 0x54c779
        : normalizedPatience > 0.25
          ? 0xf5b84b
          : 0xe85c62;
    bar.fillStyle(0x3f354d, 0.88);
    bar.fillRoundedRect(-31, -54, 62, 9, 3);
    bar.fillStyle(color, 1);
    bar.fillRoundedRect(-29, -52, 58 * normalizedPatience, 5, 2);
  }

  private getThoughtProduct(customer: Customer): ProductId {
    return (
      customer.wants[
        Phaser.Math.Clamp(
          customer.itemIndex,
          0,
          Math.max(customer.wants.length - 1, 0),
        )
      ] ?? customer.wants[0] ?? "apple"
    );
  }

  private getCustomerTarget(
    customer: Customer,
    queueIndex: number | undefined,
  ): CustomerTarget {
    switch (customer.phase) {
      case "entering":
        return {
          key: "entering",
          x: ENTRY_POINT.x,
          y: ENTRY_POINT.y,
        };
      case "shopping": {
        const productId = this.getThoughtProduct(customer);
        const shelfPoint = PRODUCTS[productId].shelfPoint;
        const offset = this.stableCustomerOffset(customer.id);
        return {
          key: `shopping:${customer.itemIndex}:${productId}`,
          x: shelfPoint.x + offset,
          y: shelfPoint.y + 42,
        };
      }
      case "queue": {
        const safeQueueIndex = Math.min(
          queueIndex ?? QUEUE_POINTS.length - 1,
          QUEUE_POINTS.length - 1,
        );
        const point = QUEUE_POINTS[safeQueueIndex];
        return {
          key: `queue:${safeQueueIndex}`,
          x: point.x,
          y: point.y,
        };
      }
      case "leaving":
      case "upset":
        return {
          key: customer.phase,
          x: EXIT_POINT.x,
          y: EXIT_POINT.y,
        };
      default:
        return {
          key: "checkout",
          x: CHECKOUT_POINT.x,
          y: CHECKOUT_POINT.y,
        };
    }
  }

  private stableCustomerOffset(customerId: string): number {
    let hash = 0;
    for (const character of customerId) {
      hash = (hash * 31 + character.charCodeAt(0)) | 0;
    }
    return (Math.abs(hash) % 25) - 12;
  }

  private moveCustomer(
    visual: CustomerVisual,
    target: CustomerTarget,
  ): void {
    if (visual.targetKey === target.key) {
      return;
    }

    visual.targetKey = target.key;
    const distance = Phaser.Math.Distance.Between(
      visual.container.x,
      visual.container.y,
      target.x,
      target.y,
    );
    visual.sprite.setFlipX(target.x > visual.container.x);
    this.tweens.killTweensOf(visual.container);
    this.tweens.add({
      targets: visual.container,
      x: target.x,
      y: target.y,
      alpha: 1,
      duration: Phaser.Math.Clamp(distance * 3.4, 260, 1180),
      ease: "Sine.inOut",
      onUpdate: () => {
        visual.container.setDepth(
          100 + Math.round(visual.container.y),
        );
      },
      onComplete: () => {
        visual.sprite.setFlipX(false);
      },
    });
  }

  private removeCustomerVisual(
    id: string,
    visual: CustomerVisual,
  ): void {
    this.customerVisuals.delete(id);
    this.tweens.killTweensOf(visual.container);
    this.tweens.add({
      targets: visual.container,
      alpha: 0,
      duration: 160,
      onComplete: () => {
        visual.container.destroy(true);
      },
    });
  }

  private showSale(sale: SalePulse): void {
    if (sale.id === this.lastSaleId) {
      return;
    }
    this.lastSaleId = sale.id;

    const visual = this.customerVisuals.get(sale.customerId);
    const originX = visual?.container.x ?? CHECKOUT_POINT.x;
    const originY = (visual?.container.y ?? CHECKOUT_POINT.y) - 48;

    const amountText = this.add
      .text(originX, originY, `+¥${sale.amount}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: "22px",
        fontStyle: "bold",
        color: "#fff6a8",
        stroke: "#80542c",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(1500);
    this.tweens.add({
      targets: amountText,
      y: originY - 58,
      alpha: 0,
      scale: 1.18,
      duration: 900,
      ease: "Cubic.out",
      onComplete: () => amountText.destroy(),
    });

    for (let index = 0; index < 9; index += 1) {
      const coin = this.add
        .image(originX, originY, COIN_TEXTURE_KEY)
        .setScale(Phaser.Math.FloatBetween(1.05, 1.65))
        .setDepth(1499);
      const angle = Phaser.Math.DegToRad(
        Phaser.Math.Between(205, 335),
      );
      const distance = Phaser.Math.Between(34, 78);
      this.tweens.add({
        targets: coin,
        x: originX + Math.cos(angle) * distance,
        y: originY + Math.sin(angle) * distance + 26,
        angle: Phaser.Math.Between(-160, 160),
        alpha: 0,
        duration: Phaser.Math.Between(520, 820),
        ease: "Quad.out",
        onComplete: () => coin.destroy(),
      });
    }
  }

  private setPaused(paused: boolean): void {
    this.pausedByReact = paused;
    this.pauseCurtain?.setVisible(paused);
    this.pauseLabel?.setVisible(paused);
    this.checkoutHitArea?.disableInteractive();
    if (!paused) {
      this.checkoutHitArea?.setInteractive({ useHandCursor: true });
    }

    if (paused) {
      this.tweens.pauseAll();
    } else {
      this.tweens.resumeAll();
    }
  }

  private cleanUp(): void {
    if (this.cleanedUp) {
      return;
    }
    this.cleanedUp = true;

    for (const unsubscribe of this.eventUnsubscribers) {
      unsubscribe();
    }
    this.eventUnsubscribers = [];

    this.checkoutHitArea?.removeAllListeners();
    for (const visual of this.customerVisuals.values()) {
      this.tweens.killTweensOf(visual.container);
      visual.container.destroy(true);
    }
    this.customerVisuals.clear();
  }
}
