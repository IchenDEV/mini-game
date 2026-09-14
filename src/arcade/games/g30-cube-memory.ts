import * as THREE from "three";
import { LogicBase, clamp, makeRng } from "../kit/base";
import type {
  FxEvent,
  GameDefinition,
  GameLogic,
  InputState,
  LogicContext,
  StageContext,
} from "../kit/types";
import { addLights, box, createStageShell, Particles, setBackdrop } from "../kit/world";

export const GRID = 4;
export const PAIRS = (GRID * GRID) / 2;
export const FLIP_BACK_DELAY = 0.8;

export interface Card {
  pair: number;
  flipped: boolean;
  matched: boolean;
}

export interface GView {
  cards: Card[];
  firstPick: number | null;
  mismatchTimer: number;
  moves: number;
  matchedPairs: number;
  fx: FxEvent[];
  alive: boolean;
}

export function cardCenter(i: number): [number, number] {
  const row = Math.floor(i / GRID);
  const col = i % GRID;
  const span = (GRID - 1) / 2;
  return [(col - span) * 1.7, (row - span) * 1.7];
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "翻两张同色方块配对 · 步数越少分越高" });
  const rng = makeRng(33041);
  const v: GView = {
    cards: [],
    firstPick: null,
    mismatchTimer: 0,
    moves: 0,
    matchedPairs: 0,
    fx: [],
    alive: true,
  };

  const reset = () => {
    base.clearHud();
    const pairs: number[] = [];
    for (let p = 0; p < PAIRS; p += 1) {
      pairs.push(p, p);
    }
    for (let i = pairs.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    v.cards = pairs.map((pair) => ({ pair, flipped: false, matched: false }));
    v.firstPick = null;
    v.mismatchTimer = 0;
    v.moves = 0;
    v.matchedPairs = 0;
    v.fx = [];
    v.alive = true;
  };
  reset();

  const flipUp = (i: number) => {
    v.cards[i].flipped = true;
    v.fx.push(fxAt(i, 0x8ef0ff, 6));
    ctx.audio.play("swap", i / PAIRS);
  };

  const pick = (i: number) => {
    const card = v.cards[i];
    if (card.matched || card.flipped) return;
    if (v.mismatchTimer > 0) return;

    if (v.firstPick === null) {
      v.firstPick = i;
      flipUp(i);
      return;
    }
    const first = v.cards[v.firstPick];
    flipUp(i);
    v.moves += 1;
    if (first.pair === card.pair) {
      first.matched = true;
      card.matched = true;
      first.flipped = false;
      card.flipped = false;
      v.matchedPairs += 1;
      v.firstPick = null;
      base.score += 40;
      ctx.audio.play("pickup", 0.7);
      base.say(`配对成功 ${v.matchedPairs}/${PAIRS}`, 0.9);
      v.fx.push(fxAt(i, 0x9df2a0, 12));
      if (v.matchedPairs === PAIRS) {
        base.score = Math.max(50, 400 - v.moves * 12);
        base.detail = `${v.moves} 步完成全部配对`;
        base.finish("win");
      }
    } else {
      v.mismatchTimer = FLIP_BACK_DELAY;
    }
  };

  return {
    view: v,
    start: () => base.start(),
    pause: () => base.pause(),
    resume: () => base.resume(),
    restart: () => {
      base.restart();
      reset();
    },
    step(dt, input) {
      base.tick(dt);
      if (v.mismatchTimer > 0) {
        v.mismatchTimer -= dt;
        if (v.mismatchTimer <= 0 && v.firstPick !== null) {
          v.cards[v.firstPick].flipped = false;
          const second = v.cards.findIndex((c) => c.flipped && !c.matched);
          if (second >= 0) v.cards[second].flipped = false;
          v.firstPick = null;
        }
      }

      if (input.pointerActive && input.actionPressed) {
        const px = input.pointerX * 4.4;
        const py = input.pointerY * 3.6;
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < v.cards.length; i += 1) {
          const [cx, cy] = cardCenter(i);
          const d = Math.hypot(cx - px, cy - py);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (bestD < 1.2) pick(best);
      }
      for (const pad of input.padPressed) {
        if (pad >= 0 && pad < GRID * GRID) pick(pad);
      }
    },
    snapshot: () => base.snapshot(),
  };
}

function fxAt(i: number, color: number, count: number): FxEvent {
  const [x, y] = cardCenter(i);
  return { x, y, z: 1.2, color, count };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x0b1026, 0x1f2c5e);
    addLights(ctx.scene, ctx.accent);

    const cardGeo = new THREE.BoxGeometry(1.42, 1.42, 0.24);
    const backMat = new THREE.MeshStandardMaterial({ color: 0x334180, emissive: ctx.accent, emissiveIntensity: 0.18, metalness: 0.4, roughness: 0.4 });
    const faceMats = Array.from({ length: PAIRS }, (_, i) => {
      const hue = (i * 360) / PAIRS;
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue / 360, 0.75, 0.58),
        emissive: new THREE.Color().setHSL(hue / 360, 0.85, 0.3),
        emissiveIntensity: 0.4,
        metalness: 0.35,
        roughness: 0.35,
      });
    });
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < GRID * GRID; i += 1) {
      const mesh = new THREE.Mesh(cardGeo, backMat);
      root.add(mesh);
      meshes.push(mesh);
    }
    const particles = new Particles(ctx.scene, 50);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      v.cards.forEach((card, i) => {
        const [x, y] = cardCenter(i);
        const mesh = meshes[i];
        mesh.position.set(x, y, card.flipped || card.matched ? 0.55 : 0);
        mesh.rotation.y = Math.sin(time * 0.8 + i) * 0.05;
        mesh.material = card.flipped || card.matched ? faceMats[card.pair] : backMat;
        if (card.matched) mesh.position.z = 1.1;
      });

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, -5.2, 6.8);
      ctx.camera.lookAt(0, 0.4, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        cardGeo.dispose();
        backMat.dispose();
        faceMats.forEach((m) => m.dispose());
      },
    };
  });
}

const def: GameDefinition = {
  id: "g30-cube-memory",
  no: 30,
  name: "立方记忆",
  tagline: "十六块方块八对色，翻全靠记性。",
  category: "益智",
  controls: "点击方块 / 数字键 1-9 翻牌",
  hint: "配对成功 +40 · 步数越少结算越高",
  accent: "#818cf8",
  createLogic,
  createStage,
};

export default def;
