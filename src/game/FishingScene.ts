import Phaser from "phaser";
import {
  gameEvents,
  type FishingVisualState,
  type SceneEffectPulse,
} from "./events";

export const GAME_WIDTH = 1000;
export const GAME_HEIGHT = 563;

const ROD_TIP = new Phaser.Math.Vector2(465, 205);

function clampPercent(value: number): number {
  return Phaser.Math.Clamp(Number.isFinite(value) ? value : 0, 0, 100);
}

function getCastTarget(power: number): Phaser.Math.Vector2 {
  const normalized = clampPercent(power) / 100;
  return new Phaser.Math.Vector2(
    Phaser.Math.Linear(610, 875, normalized),
    Phaser.Math.Linear(388, 322, normalized),
  );
}

export class FishingScene extends Phaser.Scene {
  private lineGraphics!: Phaser.GameObjects.Graphics;
  private weatherGraphics!: Phaser.GameObjects.Graphics;
  private bobber!: Phaser.GameObjects.Container;
  private bobberBody!: Phaser.GameObjects.Graphics;
  private biteMark!: Phaser.GameObjects.Text;
  private reelFish!: Phaser.GameObjects.Sprite;
  private fishShadows: Phaser.GameObjects.Sprite[] = [];
  private currentState: FishingVisualState = {
    phase: "idle",
    castPower: 55,
    reel: null,
  };
  private previousPhase: FishingVisualState["phase"] = "idle";
  private castTarget = getCastTarget(55);
  private castProgress = 1;
  private castTween?: Phaser.Tweens.Tween;
  private bobberTween?: Phaser.Tweens.Tween;
  private reducedMotion = false;
  private unsubscribers: Array<() => void> = [];

  constructor() {
    super("fishing");
  }

  preload(): void {
    this.load.image(
      "fishing-bay",
      "/assets/game/fishing-bay-background.png",
    );
    this.load.spritesheet("fish-atlas", "/assets/game/fish-atlas.png", {
      frameWidth: 512,
      frameHeight: 512,
    });
  }

  create(): void {
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.add
      .image(0, 0, "fishing-bay")
      .setOrigin(0)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    this.createFishShadows();
    this.weatherGraphics = this.add.graphics().setDepth(5);
    this.lineGraphics = this.add.graphics().setDepth(12);
    this.createBobber();
    this.createReelFish();

    this.biteMark = this.add
      .text(0, 0, "!", {
        fontFamily:
          '"Arial Rounded MT Bold", "PingFang SC", system-ui, sans-serif',
        fontSize: "64px",
        fontStyle: "bold",
        color: "#fff7dd",
        stroke: "#103f64",
        strokeThickness: 10,
      })
      .setOrigin(0.5, 1)
      .setDepth(18)
      .setVisible(false);

    this.input.on("pointerdown", this.requestPrimaryAction, this);

    this.unsubscribers.push(
      gameEvents.on("scene:sync", (state) => this.syncState(state)),
      gameEvents.on("scene:paused", (paused) => this.setPaused(paused)),
      gameEvents.on("scene:effect", (pulse) => this.playEffect(pulse)),
    );

    const latest = gameEvents.getLatestState();
    if (latest) this.syncState(latest);
    this.setPaused(gameEvents.getPaused());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown());
  }

  private requestPrimaryAction(): void {
    gameEvents.emit("primary:request");
  }

  private createFishShadows(): void {
    const placements = [
      { x: 610, y: 300, frame: 1, scale: 0.17, duration: 5200 },
      { x: 786, y: 252, frame: 2, scale: 0.13, duration: 6200 },
      { x: 860, y: 434, frame: 4, scale: 0.18, duration: 7000 },
      { x: 558, y: 463, frame: 5, scale: 0.16, duration: 7600 },
    ];

    this.fishShadows = placements.map((placement, index) => {
      const fish = this.add
        .sprite(placement.x, placement.y, "fish-atlas", placement.frame)
        .setScale(placement.scale)
        .setTint(0x07577a)
        .setAlpha(0.2 + index * 0.018)
        .setDepth(3);

      if (index % 2 === 1) fish.setFlipX(true);
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: fish,
          x: placement.x + (index % 2 === 0 ? 72 : -68),
          y: placement.y + (index % 2 === 0 ? -12 : 15),
          angle: index % 2 === 0 ? 3 : -3,
          duration: placement.duration,
          ease: "Sine.InOut",
          yoyo: true,
          repeat: -1,
          delay: index * 480,
        });
      }
      return fish;
    });
  }

  private createBobber(): void {
    this.bobberBody = this.add.graphics();
    this.bobberBody.lineStyle(4, 0x103f64, 1);
    this.bobberBody.fillStyle(0xfff7df, 1);
    this.bobberBody.fillRoundedRect(-11, -4, 22, 27, 10);
    this.bobberBody.strokeRoundedRect(-11, -4, 22, 27, 10);
    this.bobberBody.fillStyle(0xe95837, 1);
    this.bobberBody.fillRoundedRect(-11, -4, 22, 12, 9);
    this.bobberBody.lineBetween(0, -4, 0, -20);
    this.bobberBody.fillStyle(0xf4c347, 1);
    this.bobberBody.fillCircle(0, -22, 4);
    this.bobber = this.add
      .container(this.castTarget.x, this.castTarget.y, [this.bobberBody])
      .setDepth(16)
      .setVisible(false);
  }

  private createReelFish(): void {
    this.reelFish = this.add
      .sprite(this.castTarget.x - 10, this.castTarget.y + 55, "fish-atlas", 0)
      .setScale(0.15)
      .setTint(0x07577a)
      .setAlpha(0)
      .setDepth(8);
  }

  private syncState(next: FishingVisualState): void {
    const previous = this.currentState;
    this.previousPhase = previous.phase;
    this.currentState = {
      ...next,
      castPower: clampPercent(next.castPower),
      reel: next.reel
        ? {
            tension: clampPercent(next.reel.tension),
            progress: clampPercent(next.reel.progress),
            targetCenter: clampPercent(next.reel.targetCenter),
            safeWidth: clampPercent(next.reel.safeWidth),
          }
        : null,
    };

    this.drawWeather(this.currentState.weather);

    if (next.phase === "casting" && previous.phase !== "casting") {
      this.startCast(next.castPower);
    } else if (next.phase === "idle") {
      this.hideFishingRig();
    } else if (
      next.phase === "waiting" ||
      next.phase === "bite" ||
      next.phase === "reeling"
    ) {
      this.castTarget = getCastTarget(next.castPower);
      this.castProgress = 1;
      this.bobber.setPosition(this.castTarget.x, this.castTarget.y).setVisible(true);
      this.drawLine(1);
    }

    if (next.phase === "bite" && previous.phase !== "bite") {
      this.playBite();
    } else if (next.phase !== "bite") {
      this.biteMark.setVisible(false);
    }

    if (next.phase === "reeling") {
      this.updateReelingVisual();
    } else {
      this.reelFish.setAlpha(0);
      this.stopBobberShake();
    }

    if (next.phase === "caught" && previous.phase !== "caught") {
      this.playCatchBurst();
      this.hideFishingRig();
    }
  }

  private startCast(power: number): void {
    this.castTween?.stop();
    this.castTarget = getCastTarget(power);
    this.castProgress = 0;
    this.bobber.setPosition(ROD_TIP.x, ROD_TIP.y).setVisible(true);
    this.biteMark.setVisible(false);

    if (this.reducedMotion) {
      this.castProgress = 1;
      this.bobber.setPosition(this.castTarget.x, this.castTarget.y);
      this.drawLine(1);
      this.playSplash();
      return;
    }

    const progressProxy = { value: 0 };
    this.castTween = this.tweens.add({
      targets: progressProxy,
      value: 1,
      duration: 620,
      ease: "Cubic.Out",
      onUpdate: () => {
        this.castProgress = progressProxy.value;
        const curve = this.getCastCurve();
        const point = curve.getPoint(this.castProgress);
        this.bobber.setPosition(point.x, point.y);
        this.drawLine(this.castProgress);
      },
      onComplete: () => {
        this.castProgress = 1;
        this.bobber.setPosition(this.castTarget.x, this.castTarget.y);
        this.drawLine(1);
        this.playSplash();
      },
    });
  }

  private getCastCurve(): Phaser.Curves.QuadraticBezier {
    const lift = Phaser.Math.Linear(115, 210, this.currentState.castPower / 100);
    const control = new Phaser.Math.Vector2(
      (ROD_TIP.x + this.castTarget.x) / 2,
      Math.min(ROD_TIP.y, this.castTarget.y) - lift,
    );
    return new Phaser.Curves.QuadraticBezier(ROD_TIP, control, this.castTarget);
  }

  private drawLine(progress: number): void {
    this.lineGraphics.clear();
    const curve = this.getCastCurve();
    const steps = 30;
    const points: Phaser.Math.Vector2[] = [];
    for (let index = 0; index <= steps; index += 1) {
      points.push(curve.getPoint((index / steps) * progress));
    }
    if (points.length < 2) return;

    const wobble =
      this.currentState.phase === "reeling" && this.currentState.reel
        ? (this.currentState.reel.tension - 50) / 18
        : 0;
    if (wobble !== 0) {
      points.forEach((point, index) => {
        const ratio = index / Math.max(1, points.length - 1);
        point.y += Math.sin(ratio * Math.PI * 3) * wobble * ratio;
      });
    }

    this.lineGraphics.lineStyle(6, 0x103f64, 0.72);
    this.lineGraphics.strokePoints(points, false, false);
    this.lineGraphics.lineStyle(2.4, 0xfff8de, 1);
    this.lineGraphics.strokePoints(points, false, false);
  }

  private playSplash(): void {
    this.spawnRipple(this.castTarget.x, this.castTarget.y + 12, 0);
    this.spawnRipple(this.castTarget.x, this.castTarget.y + 12, 110);
    for (let index = 0; index < 8; index += 1) {
      const drop = this.add
        .circle(
          this.castTarget.x,
          this.castTarget.y + 7,
          Phaser.Math.Between(2, 4),
          0xdff7fb,
          0.9,
        )
        .setDepth(15);
      const angle = Phaser.Math.FloatBetween(-2.75, -0.4);
      const distance = Phaser.Math.Between(24, 52);
      this.tweens.add({
        targets: drop,
        x: drop.x + Math.cos(angle) * distance,
        y: drop.y + Math.sin(angle) * distance + 24,
        alpha: 0,
        scale: 0.45,
        duration: this.reducedMotion ? 120 : 430,
        ease: "Quad.Out",
        onComplete: () => drop.destroy(),
      });
    }
  }

  private spawnRipple(x: number, y: number, delay: number): void {
    const ripple = this.add
      .ellipse(x, y, 72, 24)
      .setStrokeStyle(4, 0xe5fbff, 0.9)
      .setDepth(11)
      .setScale(0.25)
      .setAlpha(0);
    this.tweens.add({
      targets: ripple,
      scaleX: 1.45,
      scaleY: 1.25,
      alpha: { from: 0.88, to: 0 },
      delay,
      duration: this.reducedMotion ? 180 : 720,
      ease: "Cubic.Out",
      onComplete: () => ripple.destroy(),
    });
  }

  private playBite(): void {
    this.biteMark
      .setPosition(this.castTarget.x, this.castTarget.y - 36)
      .setVisible(true)
      .setScale(0.45);
    this.tweens.add({
      targets: this.biteMark,
      scale: 1,
      y: this.castTarget.y - 48,
      duration: this.reducedMotion ? 80 : 180,
      ease: "Back.Out",
    });
    this.playSplash();
    if (!this.reducedMotion) {
      this.cameras.main.zoomTo(
        1.018,
        90,
        Phaser.Math.Easing.Quadratic.Out,
        true,
      );
      this.time.delayedCall(120, () =>
        this.cameras.main.zoomTo(
          1,
          150,
          Phaser.Math.Easing.Quadratic.InOut,
          true,
        ),
      );
    }
  }

  private updateReelingVisual(): void {
    const reel = this.currentState.reel;
    if (!reel) return;

    this.drawLine(1);
    this.biteMark.setVisible(false);
    this.reelFish
      .setFrame(
        Phaser.Math.Clamp(Math.floor(this.currentState.fishFrame ?? 0), 0, 5),
      )
      .setPosition(
        this.castTarget.x - 28 + Math.sin(reel.progress / 9) * 13,
        this.castTarget.y + 50 + (100 - reel.progress) * 0.18,
      )
      .setFlipX(reel.tension > 55)
      .setAlpha(Phaser.Math.Linear(0.16, 0.48, reel.progress / 100));

    const shake = Phaser.Math.Linear(0.5, 2.5, Math.abs(reel.tension - 50) / 50);
    if (!this.reducedMotion && !this.bobberTween) {
      this.bobberTween = this.tweens.add({
        targets: this.bobber,
        angle: { from: -shake, to: shake },
        y: this.castTarget.y + 3,
        duration: 90,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private stopBobberShake(): void {
    this.bobberTween?.stop();
    this.bobberTween = undefined;
    if (this.bobber) {
      this.bobber.setAngle(0);
      this.bobber.setY(this.castTarget.y);
    }
  }

  private playCatchBurst(): void {
    const frame = Phaser.Math.Clamp(
      Math.floor(this.currentState.fishFrame ?? 0),
      0,
      5,
    );
    const fish = this.add
      .sprite(this.castTarget.x, this.castTarget.y + 24, "fish-atlas", frame)
      .setScale(0.12)
      .setDepth(25)
      .setAngle(-14);

    this.tweens.add({
      targets: fish,
      x: 505,
      y: 120,
      angle: 12,
      scale: 0.21,
      duration: this.reducedMotion ? 180 : 620,
      ease: "Back.Out",
      onComplete: () => fish.destroy(),
    });
  }

  private playEffect(pulse: SceneEffectPulse): void {
    if (pulse.kind === "catch") {
      this.playCatchBurst();
      return;
    }

    const colors =
      pulse.kind === "upgrade"
        ? [0xf5c344, 0xe95b3d, 0x75ba57]
        : [0xf5c344, 0xffef9a, 0xe95b3d];
    const originX = pulse.kind === "order" ? 155 : 815;
    const originY = pulse.kind === "order" ? 155 : 470;

    for (let index = 0; index < 12; index += 1) {
      const particle = this.add
        .circle(
          originX,
          originY,
          Phaser.Math.Between(3, 6),
          colors[index % colors.length],
        )
        .setDepth(30);
      const angle = (Math.PI * 2 * index) / 12;
      const distance = Phaser.Math.Between(35, 78);
      this.tweens.add({
        targets: particle,
        x: originX + Math.cos(angle) * distance,
        y: originY + Math.sin(angle) * distance,
        scale: 0,
        alpha: 0,
        duration: this.reducedMotion ? 160 : 520,
        ease: "Cubic.Out",
        onComplete: () => particle.destroy(),
      });
    }
  }

  private drawWeather(weather?: string): void {
    this.weatherGraphics.clear();
    if (weather !== "rainy" && weather !== "雨") return;

    this.weatherGraphics.fillStyle(0x0c5f8f, 0.08);
    this.weatherGraphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.weatherGraphics.lineStyle(2, 0xc8f4ff, 0.24);
    for (let index = 0; index < 34; index += 1) {
      const x = (index * 83 + 29) % GAME_WIDTH;
      const y = (index * 47 + 18) % GAME_HEIGHT;
      this.weatherGraphics.lineBetween(x, y, x - 9, y + 21);
    }
  }

  private hideFishingRig(): void {
    this.castTween?.stop();
    this.lineGraphics.clear();
    this.bobber.setVisible(false);
    this.biteMark.setVisible(false);
    this.reelFish.setAlpha(0);
    this.stopBobberShake();
  }

  private setPaused(paused: boolean): void {
    if (paused) {
      this.tweens.pauseAll();
    } else {
      this.tweens.resumeAll();
    }
  }

  private teardown(): void {
    this.input.off("pointerdown", this.requestPrimaryAction, this);
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    this.castTween?.stop();
    this.bobberTween?.stop();
  }
}
