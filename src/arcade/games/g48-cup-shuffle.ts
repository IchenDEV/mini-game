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
import { addLights, ball, box, createStageShell, cylinder, Particles, setBackdrop } from "../kit/world";

export const CUPS = 3;
export const ROUNDS = 6;
export const SWAP_STEP = 0.55;
export const REVEAL_TIME = 1.1;

export interface GView {
  phase: "reveal" | "swap" | "guess";
  ballCup: number;
  shown: number;
  swaps: [number, number][];
  swapIndex: number;
  swapTimer: number;
  revealTimer: number;
  round: number;
  wins: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "盯住藏珠的碗 · 用 1-3 或点击押注" });
  const rng = makeRng(77701);
  const v: GView = {
    phase: "reveal",
    ballCup: 0,
    shown: 0,
    swaps: [],
    swapIndex: 0,
    swapTimer: 0,
    revealTimer: REVEAL_TIME,
    round: 1,
    wins: 0,
    fx: [],
    alive: true,
  };

  const beginRound = () => {
    v.round += 1;
    v.ballCup = Math.floor(rng() * CUPS);
    v.phase = "reveal";
    v.revealTimer = REVEAL_TIME;
    const swapCount = 2 + v.round;
    v.swaps = [];
    for (let i = 0; i < swapCount; i += 1) {
      let a = Math.floor(rng() * CUPS);
      let b = Math.floor(rng() * CUPS);
      while (b === a) b = Math.floor(rng() * CUPS);
      v.swaps.push([a, b]);
    }
    v.swapIndex = 0;
    v.swapTimer = SWAP_STEP;
  };

  const reset = () => {
    base.clearHud();
    v.round = 0;
    v.wins = 0;
    v.fx = [];
    v.alive = true;
    v.round = 1;
    v.ballCup = Math.floor(rng() * CUPS);
    v.phase = "reveal";
    v.revealTimer = REVEAL_TIME;
    v.swaps = [];
    v.swapIndex = 0;
    v.swapTimer = SWAP_STEP;
    const swapCount = 2 + v.round;
    for (let i = 0; i < swapCount; i += 1) {
      let a = Math.floor(rng() * CUPS);
      let b = Math.floor(rng() * CUPS);
      while (b === a) b = Math.floor(rng() * CUPS);
      v.swaps.push([a, b]);
    }
  };
  reset();

  const guess = (cup: number) => {
    if (v.phase !== "guess") return;
    if (cup === v.ballCup) {
      v.wins += 1;
      base.score += 30 + v.round * 5;
      ctx.audio.play("pickup", 0.8);
      base.say("押中！", 0.9);
      if (v.round >= ROUNDS) {
        base.detail = `六轮押中 ${v.wins} 次`;
        base.finish("win");
        return;
      }
      beginRound();
    } else {
      v.alive = false;
      v.fx.push({ x: cupX(cup), y: 0.6, z: 0, color: 0xff6b7a, count: 16 });
      base.detail = `第 ${v.round} 轮押错 · 押中 ${v.wins} 次`;
      base.finish("lose");
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
      if (!v.alive) return;

      if (v.phase === "reveal") {
        v.revealTimer -= dt;
        if (v.revealTimer <= 0) {
          v.phase = "swap";
          base.say(`第 ${v.round} 轮 · 看好珠子`, 0.9);
        }
      } else if (v.phase === "swap") {
        v.swapTimer -= dt;
        if (v.swapTimer <= 0) {
          if (v.swapIndex < v.swaps.length) {
            const [a, b] = v.swaps[v.swapIndex];
            if (v.ballCup === a) v.ballCup = b;
            else if (v.ballCup === b) v.ballCup = a;
            v.swapIndex += 1;
            v.swapTimer = SWAP_STEP;
            ctx.audio.play("swap", 0.3);
          } else {
            v.phase = "guess";
          }
        }
      } else {
        for (const pad of input.padPressed) {
          if (pad < CUPS) guess(pad);
        }
        if (input.pointerActive && input.actionPressed) {
          const px = input.pointerX * 5.2;
          let best = -1;
          let bestD = Infinity;
          for (let c = 0; c < CUPS; c += 1) {
            const d = Math.abs(cupX(c) - px);
            if (d < bestD) {
              bestD = d;
              best = c;
            }
          }
          if (bestD < 1.4) guess(best);
        }
      }
    },
    snapshot: () => base.snapshot(),
  };
}

export function cupX(cup: number): number {
  return (cup - (CUPS - 1) / 2) * 2.6;
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x170f0a, 0x4a3020);
    addLights(ctx.scene, ctx.accent);

    const table = box(11, 0.4, 5, 0x6b4a2a, { roughness: 0.8 });
    table.position.set(0, -0.2, 0);
    root.add(table);

    const cupGeo = cylinder(0.72, 0.5, 1.1, 18);
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xb0483f, metalness: 0.3, roughness: 0.55 });
    const cupMeshes: THREE.Mesh[] = [];
    for (let c = 0; c < CUPS; c += 1) {
      const mesh = new THREE.Mesh(cupGeo, cupMat);
      mesh.position.set(cupX(c), 0.55, 0);
      root.add(mesh);
      cupMeshes.push(mesh);
    }
    const pearl = ball(0.2, 0xffffff, 0x9be8ff);
    root.add(pearl);
    const particles = new Particles(ctx.scene, 40);

    const paint = (dt: number, time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const positions = [cupX(0), cupX(1), cupX(2)];
      // Apply partial progress of swaps visually: cups lerp to their slots.
      const slotOf = [0, 1, 2];
      let progress = 1;
      if (v.phase === "swap") {
        progress = 1 - clamp(v.swapTimer / SWAP_STEP, 0, 1);
        for (let i = 0; i < v.swapIndex; i += 1) {
          const [a, b] = v.swaps[i];
          const ia = slotOf.indexOf(a);
          const ib = slotOf.indexOf(b);
          [slotOf[ia], slotOf[ib]] = [slotOf[ib], slotOf[ia]];
        }
        const [a, b] = v.swaps[Math.min(v.swapIndex, v.swaps.length - 1)] ?? [0, 0];
        const ia = slotOf.indexOf(a);
        const ib = slotOf.indexOf(b);
        void ia;
        void ib;
      }
      cupMeshes.forEach((mesh, c) => {
        const slot = slotOf[c];
        mesh.position.x = positions[slot];
        mesh.position.y = 0.55 + Math.sin(time * 2 + c) * 0.02;
        if (v.phase === "swap" && progress < 1) {
          const [a, b] = v.swaps[Math.min(v.swapIndex, v.swaps.length - 1)];
          if (slotOf[c] === a) mesh.position.x += (positions[b] - positions[a]) * (1 - progress) * 0.35;
          if (slotOf[c] === b) mesh.position.x -= (positions[b] - positions[a]) * (1 - progress) * 0.35;
        }
      });
      pearl.visible = v.phase === "reveal";
      if (pearl.visible) {
        pearl.position.set(positions[v.ballCup], 0.16, 0.4);
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 10);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 2.6, 7.2);
      ctx.camera.lookAt(0, 0.4, 0);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        cupGeo.dispose();
        cupMat.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g48-cup-shuffle",
  no: 48,
  name: "三仙归洞",
  tagline: "三只碗换来换去，珠子到底在哪只下面？",
  category: "益智",
  controls: "数字键 1-3 / 点击碗押注",
  hint: "每轮多换一次 · 押中 +分 · 押错即失败",
  accent: "#f97316",
  createLogic,
  createStage,
};

export default def;
