import Phaser from "phaser";
import {
  ECLIPSE_HIT_PENALTY_MS,
  STARWEAVER_DURATION_MS,
  chooseNextTarget,
  clamp,
  createSeededRandom,
  distance,
  distanceSquared,
  scoreForStitch,
  timeBonusForStitch,
  updateBestScore,
  type RandomSource,
} from "./starweaver";
import {
  starweaverEvents,
  type StarweaverCommand,
  type StarweaverSnapshot,
  type StarweaverStatus,
} from "./starweaverEvents";
import { starweaverSound } from "./starweaverSound";

const SKY_TEXTURE = "starweaver-sky";
const ATLAS_TEXTURE = "starweaver-atlas";
const PLAYER_FRAME = 0;
const ANCHOR_FRAME = 1;
const ECLIPSE_FRAME = 2;
const SPARK_FRAME = 3;
const MAX_TIME_MS = 99_000;
const EDGE_PADDING = 22;
const TRAIL_SAMPLE_MS = 28;
const HAZARD_COOLDOWN_MS = 950;
const STITCH_COOLDOWN_MS = 260;
const SPARK_RESPAWN_MIN_MS = 3_600;
const SPARK_RESPAWN_RANGE_MS = 2_200;
const SPARK_TIME_BONUS_MS = 600;

interface Placement {
  landscape: readonly [number, number];
  portrait: readonly [number, number];
}

interface AnchorBody {
  id: string;
  placement: Placement;
  sprite: Phaser.GameObjects.Sprite;
  hitRadius: number;
  x: number;
  y: number;
}

interface HazardBody {
  id: string;
  placement: Placement;
  sprite: Phaser.GameObjects.Sprite;
  hitRadius: number;
  nearRadius: number;
  nearMissArmed: boolean;
  cooldownUntil: number;
  x: number;
  y: number;
}

interface SparkBody {
  id: string;
  placement: Placement;
  sprite: Phaser.GameObjects.Sprite;
  hitRadius: number;
  respawnRemainingMs: number;
  x: number;
  y: number;
}

interface NormalizedPoint {
  x: number;
  y: number;
}

const ANCHOR_LAYOUTS: readonly Placement[] = [
  { landscape: [0.13, 0.27], portrait: [0.2, 0.2] },
  { landscape: [0.34, 0.16], portrait: [0.72, 0.14] },
  { landscape: [0.61, 0.2], portrait: [0.5, 0.33] },
  { landscape: [0.86, 0.31], portrait: [0.18, 0.48] },
  { landscape: [0.78, 0.66], portrait: [0.8, 0.5] },
  { landscape: [0.51, 0.77], portrait: [0.58, 0.67] },
  { landscape: [0.21, 0.68], portrait: [0.28, 0.8] },
];

const HAZARD_LAYOUTS: readonly Placement[] = [
  { landscape: [0.48, 0.44], portrait: [0.5, 0.51] },
  { landscape: [0.7, 0.42], portrait: [0.13, 0.66] },
  { landscape: [0.3, 0.43], portrait: [0.85, 0.31] },
];

const SPARK_LAYOUTS: readonly Placement[] = [
  { landscape: [0.2, 0.46], portrait: [0.48, 0.09] },
  { landscape: [0.42, 0.63], portrait: [0.84, 0.72] },
  { landscape: [0.67, 0.55], portrait: [0.14, 0.36] },
  { landscape: [0.86, 0.51], portrait: [0.52, 0.87] },
];

function safeStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function secondsLabel(milliseconds: number): string {
  const seconds = milliseconds / 1_000;
  return seconds.toFixed(2).replace(/\.?0+$/, "");
}

function isNativeControlFocused(): boolean {
  if (typeof document === "undefined") return false;
  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLElement &&
    activeElement.matches("button, a, input, textarea, select")
  );
}

export class StarweaverScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private trailGraphics!: Phaser.GameObjects.Graphics;
  private constellationGraphics!: Phaser.GameObjects.Graphics;
  private guideGraphics!: Phaser.GameObjects.Graphics;
  private player!: Phaser.GameObjects.Sprite;
  private anchors: AnchorBody[] = [];
  private hazards: HazardBody[] = [];
  private sparks: SparkBody[] = [];
  private targetAnchor: AnchorBody | null = null;
  private tetherAnchor: AnchorBody | null = null;
  private lastStitchedAnchor: AnchorBody | null = null;
  private status: StarweaverStatus = "ready";
  private timeRemainingMs = STARWEAVER_DURATION_MS;
  private score = 0;
  private bestScore = 0;
  private stitches = 0;
  private combo = 0;
  private maxCombo = 0;
  private nearMisses = 0;
  private nearMissChain = 0;
  private label: string | null = "按住星盘，蓄势后松手穿针";
  private eventSequence = 0;
  private velocity = new Phaser.Math.Vector2();
  private orbitAngle = 0;
  private orbitRadius = 80;
  private orbitDirection = 1;
  private tetherHeldMs = 0;
  private elapsedPlayingMs = 0;
  private lastTrailSampleAt = 0;
  private lastStitchAt = -Infinity;
  private lastPublishedCountdown = -1;
  private width = 1;
  private height = 1;
  private playerHitRadius = 15;
  private reducedMotion = false;
  private qaMode = false;
  private random: RandomSource = Math.random;
  private trailPoints: NormalizedPoint[] = [];
  private constellationSegments: Array<readonly [NormalizedPoint, NormalizedPoint]> = [];
  private readonly activePointerIds = new Set<number>();
  private spaceHeld = false;
  private teardownComplete = false;
  private commandUnsubscribe: (() => void) | null = null;

  constructor() {
    super("starweaver");
  }

  preload(): void {
    this.load.image(
      SKY_TEXTURE,
      `${import.meta.env.BASE_URL}assets/game/starweaver-sky.png`,
    );
    this.load.spritesheet(
      ATLAS_TEXTURE,
      `${import.meta.env.BASE_URL}assets/game/starweaver-atlas.png`,
      {
      frameWidth: 627,
      frameHeight: 627,
      },
    );
  }

  create(): void {
    this.teardownComplete = false;
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.qaMode =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("qa") === "1";
    this.width = Math.max(1, this.scale.width);
    this.height = Math.max(1, this.scale.height);

    this.background = this.add.image(0, 0, SKY_TEXTURE).setDepth(-20);
    this.trailGraphics = this.add.graphics().setDepth(2);
    this.constellationGraphics = this.add.graphics().setDepth(3);
    this.guideGraphics = this.add.graphics().setDepth(12);
    this.createFieldObjects();

    this.bestScore = updateBestScore(0, safeStorage());
    this.resetGame(false);
    this.installInputHandlers();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.commandUnsubscribe = starweaverEvents.onCommand((command) =>
      this.handleCommand(command),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown, this);
  }

  update(_time: number, delta: number): void {
    const clockDelta = Number.isFinite(delta)
      ? Math.min(Math.max(delta, 0), 250)
      : 0;
    const physicsDelta = Math.min(clockDelta, 50);

    if (this.status !== "playing") {
      this.drawGuides();
      return;
    }

    this.elapsedPlayingMs += clockDelta;
    this.timeRemainingMs = Math.max(0, this.timeRemainingMs - clockDelta);
    if (this.timeRemainingMs <= 0) {
      this.finishGame();
      return;
    }

    this.updateSparks(clockDelta);
    if (this.tetherAnchor) {
      this.updateTether(physicsDelta);
    } else {
      this.updateFlight(physicsDelta);
    }

    this.updateCollisions();
    this.updateAmbientRotation(physicsDelta);
    this.recordTrail();
    this.drawGuides();
    this.publishCountdown();
  }

  private createFieldObjects(): void {
    this.anchors = ANCHOR_LAYOUTS.map((placement, index) => {
      const sprite = this.add
        .sprite(0, 0, ATLAS_TEXTURE, ANCHOR_FRAME)
        .setDepth(6);
      return {
        id: `anchor-${index + 1}`,
        placement,
        sprite,
        hitRadius: 42,
        x: 0,
        y: 0,
      };
    });

    this.hazards = HAZARD_LAYOUTS.map((placement, index) => {
      const sprite = this.add
        .sprite(0, 0, ATLAS_TEXTURE, ECLIPSE_FRAME)
        .setDepth(5);
      return {
        id: `eclipse-${index + 1}`,
        placement,
        sprite,
        hitRadius: 44,
        nearRadius: 70,
        nearMissArmed: true,
        cooldownUntil: -Infinity,
        x: 0,
        y: 0,
      };
    });

    this.sparks = SPARK_LAYOUTS.map((placement, index) => {
      const sprite = this.add
        .sprite(0, 0, ATLAS_TEXTURE, SPARK_FRAME)
        .setDepth(8);
      return {
        id: `spark-${index + 1}`,
        placement,
        sprite,
        hitRadius: 18,
        respawnRemainingMs: 0,
        x: 0,
        y: 0,
      };
    });

    this.player = this.add
      .sprite(0, 0, ATLAS_TEXTURE, PLAYER_FRAME)
      .setDepth(10);
    this.applyLayout();
  }

  private applyLayout(previousWidth = this.width, previousHeight = this.height): void {
    const portrait = this.height > this.width;
    const minimumDimension = Math.min(this.width, this.height);
    const anchorSize = clamp(minimumDimension * 0.17, 82, 132);
    const hazardSize = clamp(minimumDimension * 0.19, 90, 148);
    const sparkSize = clamp(minimumDimension * 0.088, 44, 68);
    const playerSize = clamp(minimumDimension * 0.15, 72, 116);

    this.resizeBackground();

    for (const anchor of this.anchors) {
      const [normalizedX, normalizedY] = portrait
        ? anchor.placement.portrait
        : anchor.placement.landscape;
      anchor.x = normalizedX * this.width;
      anchor.y = normalizedY * this.height;
      anchor.hitRadius = anchorSize * 0.36;
      anchor.sprite
        .setPosition(anchor.x, anchor.y)
        .setDisplaySize(anchorSize, anchorSize);
    }

    for (const hazard of this.hazards) {
      const [normalizedX, normalizedY] = portrait
        ? hazard.placement.portrait
        : hazard.placement.landscape;
      hazard.x = normalizedX * this.width;
      hazard.y = normalizedY * this.height;
      hazard.hitRadius = hazardSize * 0.35;
      hazard.nearRadius = hazard.hitRadius + clamp(minimumDimension * 0.035, 14, 28);
      hazard.sprite
        .setPosition(hazard.x, hazard.y)
        .setDisplaySize(hazardSize, hazardSize);
    }

    for (const spark of this.sparks) {
      const [normalizedX, normalizedY] = portrait
        ? spark.placement.portrait
        : spark.placement.landscape;
      spark.x = normalizedX * this.width;
      spark.y = normalizedY * this.height;
      spark.hitRadius = sparkSize * 0.3;
      spark.sprite
        .setPosition(spark.x, spark.y)
        .setDisplaySize(sparkSize, sparkSize);
    }

    this.playerHitRadius = playerSize * 0.17;
    this.player.setDisplaySize(playerSize, playerSize);

    if (previousWidth > 1 && previousHeight > 1 && this.player.x !== 0) {
      this.player.setPosition(
        clamp((this.player.x / previousWidth) * this.width, EDGE_PADDING, this.width - EDGE_PADDING),
        clamp((this.player.y / previousHeight) * this.height, EDGE_PADDING, this.height - EDGE_PADDING),
      );
      this.orbitRadius *=
        Math.min(this.width, this.height) /
        Math.max(1, Math.min(previousWidth, previousHeight));
    }

    this.redrawPersistentLines();
    this.drawGuides();
  }

  private resizeBackground(): void {
    const sourceWidth = this.background.texture.getSourceImage().width;
    const sourceHeight = this.background.texture.getSourceImage().height;
    const scale = Math.max(this.width / sourceWidth, this.height / sourceHeight);
    this.background
      .setPosition(this.width / 2, this.height / 2)
      .setDisplaySize(sourceWidth * scale, sourceHeight * scale);
  }

  private resetGame(startPlaying: boolean): void {
    this.tweens.resumeAll();
    this.random = createSeededRandom(
      this.qaMode
        ? "starweaver-qa-v1"
        : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    );
    this.status = startPlaying ? "playing" : "ready";
    this.timeRemainingMs = STARWEAVER_DURATION_MS;
    this.score = 0;
    this.stitches = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.nearMisses = 0;
    this.nearMissChain = 0;
    this.elapsedPlayingMs = 0;
    this.lastStitchAt = -Infinity;
    this.lastPublishedCountdown = -1;
    this.velocity.set(0, 0);
    this.tetherAnchor = null;
    this.lastStitchedAnchor = this.anchors[0] ?? null;
    this.activePointerIds.clear();
    this.spaceHeld = false;
    this.trailPoints = [];
    this.constellationSegments = [];
    this.trailGraphics.clear();
    this.constellationGraphics.clear();

    for (const hazard of this.hazards) {
      hazard.nearMissArmed = true;
      hazard.cooldownUntil = -Infinity;
    }
    for (const spark of this.sparks) {
      spark.respawnRemainingMs = 0;
      spark.sprite.setVisible(true).setActive(true).setAlpha(1);
    }

    const startAnchor = this.anchors[0];
    if (startAnchor) {
      const startRadius = clamp(Math.min(this.width, this.height) * 0.11, 52, 94);
      this.player.setPosition(startAnchor.x + startRadius, startAnchor.y);
      this.player.setRotation(Math.PI / 2);
      this.targetAnchor = chooseNextTarget(
        this.anchors,
        startAnchor.id,
        this.player,
        this.random,
      );
    } else {
      this.player.setPosition(this.width / 2, this.height / 2);
      this.targetAnchor = null;
    }

    this.label = startPlaying
      ? "星轨已开启 · 按住牵引"
      : "按住星盘，蓄势后松手穿针";
    this.eventSequence += 1;
    this.recordTrail(true);
    this.drawGuides();
    this.publish(true);
  }

  private startFromCanvas(): void {
    if (this.status === "gameover") {
      this.resetGame(true);
      return;
    }
    if (this.status !== "ready") return;

    this.status = "playing";
    this.announce("星轨已开启 · 松手发射");
  }

  private handleCommand(command: StarweaverCommand): void {
    switch (command) {
      case "restart":
        void starweaverSound.unlock().catch(() => undefined);
        this.resetGame(true);
        break;
      case "toggle-pause":
        this.togglePause();
        break;
      case "toggle-sound": {
        const enabled = starweaverSound.toggle();
        if (enabled) void starweaverSound.unlock().catch(() => undefined);
        this.label = enabled ? "星音已开启" : "星音已静默";
        this.eventSequence += 1;
        this.publish(true);
        break;
      }
    }
  }

  private togglePause(): void {
    if (this.status === "playing") {
      this.releaseHeldControls(false);
      this.status = "paused";
      this.tweens.pauseAll();
      this.announce("星图已暂停");
    } else if (this.status === "paused") {
      this.status = "playing";
      this.tweens.resumeAll();
      this.announce("继续织星");
    }
  }

  private beginTether(): void {
    if (this.status !== "playing" || this.tetherAnchor) return;

    let nearest: AnchorBody | null = null;
    let nearestDistanceSquared = Infinity;
    for (const anchor of this.anchors) {
      const candidateDistance = distanceSquared(this.player, anchor);
      if (candidateDistance < nearestDistanceSquared) {
        nearest = anchor;
        nearestDistanceSquared = candidateDistance;
      }
    }
    if (!nearest) return;

    this.tetherAnchor = nearest;
    const dx = this.player.x - nearest.x;
    const dy = this.player.y - nearest.y;
    this.orbitAngle = Math.atan2(dy, dx);
    this.orbitRadius = Math.max(
      Math.sqrt(nearestDistanceSquared),
      clamp(Math.min(this.width, this.height) * 0.065, 44, 68),
    );
    const tangentX = -Math.sin(this.orbitAngle);
    const tangentY = Math.cos(this.orbitAngle);
    const tangentDot = this.velocity.x * tangentX + this.velocity.y * tangentY;
    this.orbitDirection =
      Math.abs(tangentDot) > 8 ? Math.sign(tangentDot) : this.random() < 0.5 ? -1 : 1;
    this.tetherHeldMs = 0;
    starweaverSound.play("tether");
    this.announce("牵引锁定 · 蓄势");
  }

  private releaseTether(playSound = true): void {
    if (!this.tetherAnchor) return;

    const angularSpeed = this.currentAngularSpeed();
    const releaseSpeed = clamp(this.orbitRadius * angularSpeed, 300, 790);
    const tangentX = -Math.sin(this.orbitAngle) * this.orbitDirection;
    const tangentY = Math.cos(this.orbitAngle) * this.orbitDirection;
    this.velocity.set(tangentX * releaseSpeed, tangentY * releaseSpeed);
    this.tetherAnchor = null;
    if (playSound) starweaverSound.play("release");
    this.announce(`切线释放 · ${Math.round(releaseSpeed)} 星速`);
  }

  private currentAngularSpeed(): number {
    return clamp(1.85 + this.tetherHeldMs * 0.00125, 1.85, 5.45);
  }

  private updateTether(delta: number): void {
    const anchor = this.tetherAnchor;
    if (!anchor) return;

    this.tetherHeldMs += delta;
    const angularSpeed = this.currentAngularSpeed();
    const idealRadius = clamp(
      Math.min(this.width, this.height) * 0.11,
      52,
      94,
    );
    const safeRadius = Math.max(
      idealRadius * 0.72,
      Math.min(
        anchor.x - EDGE_PADDING,
        this.width - anchor.x - EDGE_PADDING,
        anchor.y - EDGE_PADDING,
        this.height - anchor.y - EDGE_PADDING,
      ),
    );
    const desiredRadius = Math.min(idealRadius, safeRadius);
    const pull = 1 - Math.exp(-delta / 620);
    this.orbitRadius = Phaser.Math.Linear(
      this.orbitRadius,
      desiredRadius,
      pull,
    );
    this.orbitAngle +=
      this.orbitDirection * angularSpeed * (delta / 1_000);
    const padding = Math.max(EDGE_PADDING, this.playerHitRadius);
    const x = clamp(
      anchor.x + Math.cos(this.orbitAngle) * this.orbitRadius,
      padding,
      this.width - padding,
    );
    const y = clamp(
      anchor.y + Math.sin(this.orbitAngle) * this.orbitRadius,
      padding,
      this.height - padding,
    );
    this.player.setPosition(x, y);

    const tangentX = -Math.sin(this.orbitAngle) * this.orbitDirection;
    const tangentY = Math.cos(this.orbitAngle) * this.orbitDirection;
    const speed = clamp(this.orbitRadius * angularSpeed, 260, 790);
    this.velocity.set(tangentX * speed, tangentY * speed);
    this.player.setRotation(Math.atan2(tangentY, tangentX));
  }

  private updateFlight(delta: number): void {
    if (this.velocity.lengthSq() < 1) return;

    const seconds = delta / 1_000;
    this.player.x += this.velocity.x * seconds;
    this.player.y += this.velocity.y * seconds;

    let bounced = false;
    const padding = Math.max(EDGE_PADDING, this.playerHitRadius);
    if (this.player.x < padding) {
      this.player.x = padding;
      this.velocity.x = Math.abs(this.velocity.x);
      bounced = true;
    } else if (this.player.x > this.width - padding) {
      this.player.x = this.width - padding;
      this.velocity.x = -Math.abs(this.velocity.x);
      bounced = true;
    }
    if (this.player.y < padding) {
      this.player.y = padding;
      this.velocity.y = Math.abs(this.velocity.y);
      bounced = true;
    } else if (this.player.y > this.height - padding) {
      this.player.y = this.height - padding;
      this.velocity.y = -Math.abs(this.velocity.y);
      bounced = true;
    }
    if (bounced) this.velocity.scale(0.985);

    this.player.setRotation(Math.atan2(this.velocity.y, this.velocity.x));
  }

  private updateCollisions(): void {
    const target = this.targetAnchor;
    if (
      target &&
      !this.tetherAnchor &&
      this.elapsedPlayingMs - this.lastStitchAt >= STITCH_COOLDOWN_MS &&
      distanceSquared(this.player, target) <=
        (target.hitRadius + this.playerHitRadius) ** 2
    ) {
      this.completeStitch(target);
    }

    if (this.status !== "playing") return;

    for (const hazard of this.hazards) {
      const squared = distanceSquared(this.player, hazard);
      const hitDistance = hazard.hitRadius + this.playerHitRadius;
      const nearDistance = hazard.nearRadius + this.playerHitRadius;

      if (squared <= hitDistance * hitDistance) {
        if (this.elapsedPlayingMs >= hazard.cooldownUntil) {
          this.hitHazard(hazard);
          if (this.status !== "playing") return;
        }
        hazard.nearMissArmed = false;
      } else if (squared <= nearDistance * nearDistance) {
        if (hazard.nearMissArmed) this.awardNearMiss(hazard);
        hazard.nearMissArmed = false;
      } else {
        hazard.nearMissArmed = true;
      }
    }

    for (const spark of this.sparks) {
      if (!spark.sprite.visible) continue;
      const collectDistance = spark.hitRadius + this.playerHitRadius;
      if (distanceSquared(this.player, spark) <= collectDistance * collectDistance) {
        this.collectSpark(spark);
      }
    }
  }

  private completeStitch(anchor: AnchorBody): void {
    this.lastStitchAt = this.elapsedPlayingMs;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.stitches += 1;
    const nearMissChain = this.nearMissChain;
    const points = scoreForStitch(this.combo, nearMissChain);
    const timeBonus = timeBonusForStitch(this.combo);
    this.score += points;
    this.bestScore = updateBestScore(this.score, safeStorage());
    this.timeRemainingMs = Math.min(MAX_TIME_MS, this.timeRemainingMs + timeBonus);
    this.nearMissChain = 0;

    if (this.lastStitchedAnchor && this.lastStitchedAnchor !== anchor) {
      this.constellationSegments.push([
        {
          x: this.lastStitchedAnchor.x / this.width,
          y: this.lastStitchedAnchor.y / this.height,
        },
        { x: anchor.x / this.width, y: anchor.y / this.height },
      ]);
      this.redrawConstellation();
    }
    this.lastStitchedAnchor = anchor;

    this.bounceFrom(anchor.x, anchor.y, anchor.hitRadius, 1.045);
    this.targetAnchor = chooseNextTarget(
      this.anchors,
      anchor.id,
      this.player,
      this.random,
    );
    this.burst(anchor.x, anchor.y, 10);
    if (!this.reducedMotion) {
      this.cameras.main.shake(95, 0.0035);
      this.cameras.main.flash(90, 221, 177, 94, false);
    }
    starweaverSound.play("stitch");
    const precision = nearMissChain > 0 ? "完美切线" : "星缝完成";
    this.announce(
      `${precision} +${points} · +${secondsLabel(timeBonus)}秒 · ${this.combo}连`,
    );
  }

  private hitHazard(hazard: HazardBody): void {
    hazard.cooldownUntil = this.elapsedPlayingMs + HAZARD_COOLDOWN_MS;
    this.timeRemainingMs = Math.max(
      0,
      this.timeRemainingMs - ECLIPSE_HIT_PENALTY_MS,
    );
    this.combo = 0;
    this.nearMissChain = 0;
    this.activePointerIds.clear();
    this.spaceHeld = false;
    this.tetherAnchor = null;
    this.bounceFrom(hazard.x, hazard.y, hazard.hitRadius, 0.9);
    if (!this.reducedMotion) this.cameras.main.shake(155, 0.008);
    starweaverSound.play("hazard");
    this.announce("蚀洞撕裂 · -4秒 · 连击中断");
    if (this.timeRemainingMs <= 0) this.finishGame();
  }

  private awardNearMiss(hazard: HazardBody): void {
    this.nearMisses += 1;
    this.nearMissChain += 1;
    const points = 35 * Math.min(this.nearMissChain, 8);
    this.score += points;
    this.bestScore = updateBestScore(this.score, safeStorage());
    this.burst(
      hazard.x + (this.player.x - hazard.x) * 0.72,
      hazard.y + (this.player.y - hazard.y) * 0.72,
      4,
    );
    starweaverSound.play("near-miss");
    this.announce(`险距掠过 +${points} · 火花链 ${this.nearMissChain}`);
  }

  private collectSpark(spark: SparkBody): void {
    const points = 70 + Math.min(this.combo, 10) * 10;
    const timeBonus = SPARK_TIME_BONUS_MS;
    this.score += points;
    this.bestScore = updateBestScore(this.score, safeStorage());
    this.timeRemainingMs = Math.min(MAX_TIME_MS, this.timeRemainingMs + timeBonus);
    spark.respawnRemainingMs =
      SPARK_RESPAWN_MIN_MS + this.random() * SPARK_RESPAWN_RANGE_MS;
    spark.sprite.setVisible(false).setActive(false);
    this.burst(spark.x, spark.y, 5);
    starweaverSound.play("spark");
    this.announce(`星屑拾取 +${points} · +0.6秒`);
  }

  private bounceFrom(
    centerX: number,
    centerY: number,
    bodyRadius: number,
    speedMultiplier: number,
  ): void {
    let normalX = this.player.x - centerX;
    let normalY = this.player.y - centerY;
    let length = Math.hypot(normalX, normalY);
    if (length < 0.001) {
      normalX = this.velocity.x === 0 ? 1 : -this.velocity.x;
      normalY = this.velocity.y === 0 ? 0 : -this.velocity.y;
      length = Math.hypot(normalX, normalY) || 1;
    }
    normalX /= length;
    normalY /= length;

    const separation = bodyRadius + this.playerHitRadius + 3;
    this.player.setPosition(
      centerX + normalX * separation,
      centerY + normalY * separation,
    );
    const dot = this.velocity.x * normalX + this.velocity.y * normalY;
    if (dot < 0) {
      this.velocity.x -= 2 * dot * normalX;
      this.velocity.y -= 2 * dot * normalY;
    } else if (this.velocity.lengthSq() < 1) {
      this.velocity.set(normalX * 360, normalY * 360);
    }
    this.velocity.scale(speedMultiplier);
  }

  private updateSparks(delta: number): void {
    for (const spark of this.sparks) {
      if (spark.sprite.visible) continue;
      spark.respawnRemainingMs -= delta;
      if (spark.respawnRemainingMs <= 0) {
        spark.respawnRemainingMs = 0;
        spark.sprite.setVisible(true).setActive(true).setAlpha(1);
        if (!this.reducedMotion) {
          const baseScaleX = spark.sprite.scaleX;
          const baseScaleY = spark.sprite.scaleY;
          spark.sprite.setScale(baseScaleX * 0.35, baseScaleY * 0.35);
          this.tweens.add({
            targets: spark.sprite,
            scaleX: baseScaleX,
            scaleY: baseScaleY,
            duration: 210,
            ease: "Back.Out",
          });
        }
      }
    }
  }

  private updateAmbientRotation(delta: number): void {
    if (this.reducedMotion) return;
    const direction = delta / 1_000;
    for (let index = 0; index < this.hazards.length; index += 1) {
      this.hazards[index].sprite.rotation +=
        direction * (index % 2 === 0 ? 0.075 : -0.065);
    }
    for (let index = 0; index < this.sparks.length; index += 1) {
      if (this.sparks[index].sprite.visible) {
        this.sparks[index].sprite.rotation +=
          direction * (index % 2 === 0 ? 0.7 : -0.7);
      }
    }
  }

  private recordTrail(force = false): void {
    if (!force && this.elapsedPlayingMs - this.lastTrailSampleAt < TRAIL_SAMPLE_MS) {
      return;
    }
    this.lastTrailSampleAt = this.elapsedPlayingMs;
    const point = {
      x: this.player.x / this.width,
      y: this.player.y / this.height,
    };
    const previous = this.trailPoints.at(-1);
    if (!force && previous) {
      const dx = (point.x - previous.x) * this.width;
      const dy = (point.y - previous.y) * this.height;
      if (dx * dx + dy * dy < 4) return;
    }
    this.trailPoints.push(point);
    if (previous) this.drawTrailSegment(previous, point);
  }

  private drawTrailSegment(from: NormalizedPoint, to: NormalizedPoint): void {
    this.trailGraphics.lineStyle(2, 0xa84f36, 0.52);
    this.trailGraphics.lineBetween(
      from.x * this.width,
      from.y * this.height,
      to.x * this.width,
      to.y * this.height,
    );
  }

  private redrawPersistentLines(): void {
    this.trailGraphics.clear();
    for (let index = 1; index < this.trailPoints.length; index += 1) {
      this.drawTrailSegment(this.trailPoints[index - 1], this.trailPoints[index]);
    }
    this.redrawConstellation();
  }

  private redrawConstellation(): void {
    this.constellationGraphics.clear();
    for (const [from, to] of this.constellationSegments) {
      this.constellationGraphics.lineStyle(3, 0xb85e3e, 0.82);
      this.constellationGraphics.lineBetween(
        from.x * this.width,
        from.y * this.height,
        to.x * this.width,
        to.y * this.height,
      );
      this.constellationGraphics.fillStyle(0xe7bd70, 0.92);
      this.constellationGraphics.fillCircle(from.x * this.width, from.y * this.height, 3);
      this.constellationGraphics.fillCircle(to.x * this.width, to.y * this.height, 3);
    }
  }

  private drawGuides(): void {
    this.guideGraphics.clear();
    const target = this.targetAnchor;
    if (target) {
      const pulse =
        this.reducedMotion || this.status !== "playing"
          ? 0
          : Math.sin(this.elapsedPlayingMs * 0.006) * 3;
      const radius = target.hitRadius + 12 + pulse;
      this.guideGraphics.lineStyle(2, 0xf2c878, 0.9);
      for (let index = 0; index < 12; index += 2) {
        this.guideGraphics.beginPath();
        this.guideGraphics.arc(
          target.x,
          target.y,
          radius,
          (index / 12) * Math.PI * 2,
          ((index + 1) / 12) * Math.PI * 2,
        );
        this.guideGraphics.strokePath();
      }
      this.guideGraphics.fillStyle(0xf7d792, 0.9);
      this.guideGraphics.fillCircle(target.x, target.y, 3.5);
    }

    const tether = this.tetherAnchor;
    if (!tether) return;
    this.guideGraphics.lineStyle(2, 0xe1b566, 0.72);
    this.guideGraphics.lineBetween(
      tether.x,
      tether.y,
      this.player.x,
      this.player.y,
    );
    this.guideGraphics.lineStyle(1, 0xb95a3f, 0.42);
    this.guideGraphics.strokeCircle(tether.x, tether.y, this.orbitRadius);

    const speedRatio = clamp((this.currentAngularSpeed() - 1.85) / 3.6, 0, 1);
    const length = 54 + speedRatio * 58;
    const tangentX = -Math.sin(this.orbitAngle) * this.orbitDirection;
    const tangentY = Math.cos(this.orbitAngle) * this.orbitDirection;
    const endX = this.player.x + tangentX * length;
    const endY = this.player.y + tangentY * length;
    this.guideGraphics.lineStyle(3, 0xf4d18c, 0.92);
    this.guideGraphics.lineBetween(this.player.x, this.player.y, endX, endY);
    const normalX = -tangentY;
    const normalY = tangentX;
    this.guideGraphics.fillStyle(0xf4d18c, 0.96);
    this.guideGraphics.fillTriangle(
      endX,
      endY,
      endX - tangentX * 13 + normalX * 6,
      endY - tangentY * 13 + normalY * 6,
      endX - tangentX * 13 - normalX * 6,
      endY - tangentY * 13 - normalY * 6,
    );
  }

  private burst(x: number, y: number, requestedCount: number): void {
    const count = this.reducedMotion ? Math.min(2, requestedCount) : requestedCount;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + this.random() * 0.4;
      const distance = 28 + this.random() * 54;
      const particle = this.add
        .sprite(x, y, ATLAS_TEXTURE, SPARK_FRAME)
        .setDisplaySize(18, 18)
        .setDepth(15)
        .setAlpha(0.9)
        .setRotation(angle);
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scaleX: particle.scaleX * 0.35,
        scaleY: particle.scaleY * 0.35,
        duration: this.reducedMotion ? 90 : 300 + this.random() * 180,
        ease: "Cubic.Out",
        onComplete: () => particle.destroy(),
      });
    }
  }

  private finishGame(): void {
    if (this.status === "gameover") return;
    this.releaseHeldControls(false);
    this.status = "gameover";
    this.timeRemainingMs = 0;
    this.velocity.set(0, 0);
    this.bestScore = updateBestScore(this.score, safeStorage());
    starweaverSound.play("gameover");
    this.announce(
      this.stitches > 0
        ? `星图封卷 · ${this.stitches}针 · 最高${this.maxCombo}连`
        : "星图封卷 · 再试一次",
    );
  }

  private announce(label: string): void {
    this.label = label;
    this.eventSequence += 1;
    this.publish(true);
  }

  private publishCountdown(): void {
    const countdown = Math.max(0, Math.ceil(this.timeRemainingMs / 100) * 100);
    if (countdown === this.lastPublishedCountdown) return;
    this.lastPublishedCountdown = countdown;
    this.publish(false);
  }

  private publish(force: boolean): void {
    const countdown = Math.max(0, Math.ceil(this.timeRemainingMs / 100) * 100);
    if (force) this.lastPublishedCountdown = countdown;
    const snapshot: StarweaverSnapshot = {
      status: this.status,
      timeRemainingMs: countdown,
      score: this.score,
      bestScore: this.bestScore,
      stitches: this.stitches,
      combo: this.combo,
      maxCombo: this.maxCombo,
      nearMisses: this.nearMisses,
      soundEnabled: starweaverSound.isEnabled(),
      label: this.label,
      eventSequence: this.eventSequence,
    };
    starweaverEvents.publish(snapshot);
  }

  private installInputHandlers(): void {
    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    this.input.on("pointerupoutside", this.handlePointerUp, this);
    this.input.on("pointercancel", this.handlePointerCancel, this);

    this.input.keyboard?.on("keydown-SPACE", this.handleSpaceDown, this);
    this.input.keyboard?.on("keyup-SPACE", this.handleSpaceUp, this);
    this.input.keyboard?.on("keydown-P", this.handlePauseKey, this);
    this.input.keyboard?.on("keydown-M", this.handleSoundKey, this);
    this.input.keyboard?.on("keydown-R", this.handleRestartKey, this);

    if (typeof window !== "undefined") {
      window.addEventListener("pointerup", this.handleWindowPointerEnd);
      window.addEventListener("pointercancel", this.handleWindowPointerEnd);
      window.addEventListener("blur", this.handleWindowBlur);
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.activePointerIds.add(pointer.id);
    void starweaverSound.unlock().catch(() => undefined);
    if (this.status === "ready" || this.status === "gameover") {
      this.startFromCanvas();
    }
    this.beginTether();
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    this.activePointerIds.delete(pointer.id);
    if (this.activePointerIds.size === 0 && !this.spaceHeld) this.releaseTether();
  }

  private handlePointerCancel(): void {
    this.activePointerIds.clear();
    if (!this.spaceHeld) this.releaseTether();
  }

  private handleSpaceDown(event: KeyboardEvent): void {
    if (event.repeat || isNativeControlFocused()) return;
    event.preventDefault();
    this.spaceHeld = true;
    void starweaverSound.unlock().catch(() => undefined);
    if (this.status === "ready" || this.status === "gameover") {
      this.startFromCanvas();
    }
    this.beginTether();
  }

  private handleSpaceUp(event: KeyboardEvent): void {
    if (!this.spaceHeld && isNativeControlFocused()) return;
    event.preventDefault();
    this.spaceHeld = false;
    if (this.activePointerIds.size === 0) this.releaseTether();
  }

  private handlePauseKey(event: KeyboardEvent): void {
    if (event.repeat) return;
    event.preventDefault();
    this.togglePause();
  }

  private handleSoundKey(event: KeyboardEvent): void {
    if (event.repeat) return;
    event.preventDefault();
    this.handleCommand("toggle-sound");
  }

  private handleRestartKey(event: KeyboardEvent): void {
    if (event.repeat) return;
    event.preventDefault();
    this.handleCommand("restart");
  }

  private readonly handleWindowPointerEnd = (): void => {
    this.activePointerIds.clear();
    if (!this.spaceHeld) this.releaseTether();
  };

  private readonly handleWindowBlur = (): void => {
    this.releaseHeldControls(true);
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) this.releaseHeldControls(true);
  };

  private releaseHeldControls(playSound: boolean): void {
    this.activePointerIds.clear();
    this.spaceHeld = false;
    this.releaseTether(playSound);
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    const previousWidth = this.width;
    const previousHeight = this.height;
    this.width = Math.max(1, gameSize.width);
    this.height = Math.max(1, gameSize.height);
    this.applyLayout(previousWidth, previousHeight);
  }

  private teardown(): void {
    if (this.teardownComplete) return;
    this.teardownComplete = true;
    this.commandUnsubscribe?.();
    this.commandUnsubscribe = null;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.input.off("pointerdown", this.handlePointerDown, this);
    this.input.off("pointerup", this.handlePointerUp, this);
    this.input.off("pointerupoutside", this.handlePointerUp, this);
    this.input.off("pointercancel", this.handlePointerCancel, this);
    this.input.keyboard?.off("keydown-SPACE", this.handleSpaceDown, this);
    this.input.keyboard?.off("keyup-SPACE", this.handleSpaceUp, this);
    this.input.keyboard?.off("keydown-P", this.handlePauseKey, this);
    this.input.keyboard?.off("keydown-M", this.handleSoundKey, this);
    this.input.keyboard?.off("keydown-R", this.handleRestartKey, this);
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerup", this.handleWindowPointerEnd);
      window.removeEventListener("pointercancel", this.handleWindowPointerEnd);
      window.removeEventListener("blur", this.handleWindowBlur);
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }
  }
}

export default StarweaverScene;
