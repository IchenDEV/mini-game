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

export const LANES = 4;
export const TOTAL_NOTES = 60;
export const HIT_Y = 0.9;
export const SPAWN_Y = 8.6;

export interface Note {
  id: number;
  lane: number;
  y: number;
  judged: boolean;
}

export interface GView {
  notes: Note[];
  done: number;
  combo: number;
  bestCombo: number;
  perfects: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "音符落线时按对应键 · D F J K 对应 1-4 也可点击" });
  const rng = makeRng(41008);
  const v: GView = {
    notes: [],
    done: 0,
    combo: 0,
    bestCombo: 0,
    perfects: 0,
    fx: [],
    alive: true,
  };
  let nextId = 1;
  let spawnTimer = 0.9;
  let fallSpeed = 3.4;
  let spawned = 0;
  let laneBag: number[] = [];

  const reset = () => {
    base.clearHud();
    v.notes = [];
    v.done = 0;
    v.combo = 0;
    v.bestCombo = 0;
    v.perfects = 0;
    v.fx = [];
    v.alive = true;
    nextId = 1;
    spawnTimer = 0.9;
    fallSpeed = 3.4;
    spawned = 0;
    laneBag = [];
  };
  reset();

  const pickLane = (): number => {
    if (laneBag.length === 0) {
      laneBag = [0, 1, 2, 3].sort(() => rng() - 0.5);
    }
    return laneBag.pop()!;
  };

  const judge = (lane: number) => {
    let bestI = -1;
    let bestDist = Infinity;
    for (let i = 0; i < v.notes.length; i += 1) {
      const note = v.notes[i];
      if (note.judged || note.lane !== lane) continue;
      const dist = Math.abs(note.y - HIT_Y);
      if (dist < bestDist) {
        bestDist = dist;
        bestI = i;
      }
    }
    if (bestI < 0) return;
    const note = v.notes[bestI];
    if (bestDist < 0.34) {
      note.judged = true;
      v.done += 1;
      v.combo += 1;
      v.bestCombo = Math.max(v.bestCombo, v.combo);
      const perfect = bestDist < 0.14;
      if (perfect) {
        v.perfects += 1;
        base.score += 30;
      } else {
        base.score += 12;
      }
      ctx.audio.play("pickup", perfect ? 1 : 0.4);
      v.fx.push({ x: laneX(lane), y: HIT_Y, z: 0, color: perfect ? 0xffd166 : 0x8ef0ff, count: perfect ? 10 : 6 });
      if (v.combo % 10 === 0) base.say(`连击 ×${v.combo}`, 0.8);
    } else {
      // Too far off: counts as a miss tap.
      v.combo = 0;
      ctx.audio.play("tick");
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
      fallSpeed = Math.min(7, 3.4 + base.elapsed * 0.06);

      spawnTimer -= dt;
      if (spawnTimer <= 0 && spawned < TOTAL_NOTES) {
        spawnTimer = clamp(0.55 - base.elapsed * 0.004, 0.3, 0.55);
        spawned += 1;
        v.notes.push({ id: nextId++, lane: pickLane(), y: SPAWN_Y, judged: false });
      }

      for (let i = v.notes.length - 1; i >= 0; i -= 1) {
        const note = v.notes[i];
        note.y -= fallSpeed * dt;
        if (!note.judged && note.y < HIT_Y - 0.45) {
          note.judged = true;
          v.done += 1;
          v.combo = 0;
          ctx.audio.play("tick");
        }
        if (note.judged && note.y < HIT_Y - 0.6) v.notes.splice(i, 1);
      }

      for (const pad of input.padPressed) {
        if (pad >= 0 && pad < LANES) judge(pad);
      }
      if (input.pointerActive && input.actionPressed) {
        const lane = Math.floor(((input.pointerX + 1) / 2) * LANES);
        if (lane >= 0 && lane < LANES) judge(lane);
      }

      if (spawned >= TOTAL_NOTES && v.notes.every((n) => n.judged)) {
        base.score += v.bestCombo * 3;
        base.detail = `结算 ${v.done}/${TOTAL_NOTES} 音 · PERFECT ×${v.perfects} · 最长连击 ×${v.bestCombo}`;
        base.finish("win");
        return;
      }
      base.setMeter(clamp(v.done / TOTAL_NOTES, 0, 1));
      base.setFields([
        { label: "连击", value: `×${v.combo}` },
        { label: "PFC", value: String(v.perfects) },
        { label: "进度", value: `${v.done}/${TOTAL_NOTES}` },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

export function laneX(lane: number): number {
  return (lane - (LANES - 1) / 2) * 1.7;
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x04101c, 0x0f2f42);
    addLights(ctx.scene, ctx.accent);

    const deck = box(8, 0.4, 14, 0x101f33, { metalness: 0.45 });
    deck.position.set(0, -0.2, -2);
    root.add(deck);
    for (let lane = 0; lane < LANES; lane += 1) {
      const divider = box(0.05, 0.1, 13, 0x24425e, { emissive: ctx.accent });
      divider.position.set(laneX(lane) - 0.85, 0.03, -2);
      root.add(divider);
    }
    const hitLine = box(6.9, 0.06, 0.18, ctx.accent, { emissive: ctx.accent });
    hitLine.position.set(0, 0.06, -2 + HIT_Y - 4);
    root.add(hitLine);

    const noteGeo = new THREE.BoxGeometry(1.5, 0.24, 0.9);
    const noteMats = Array.from({ length: LANES }, (_, i) => {
      const hue = (i * 70 + 160) % 360;
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue / 360, 0.8, 0.6),
        emissive: new THREE.Color().setHSL(hue / 360, 0.9, 0.4),
        emissiveIntensity: 0.5,
        metalness: 0.4,
        roughness: 0.35,
      });
    });
    const noteMeshes = new Map<number, THREE.Mesh>();
    const particles = new Particles(ctx.scene, 60);

    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      const seen = new Set<number>();
      for (const note of v.notes) {
        seen.add(note.id);
        let mesh = noteMeshes.get(note.id);
        if (!mesh) {
          mesh = new THREE.Mesh(noteGeo, noteMats[note.lane]);
          noteMeshes.set(note.id, mesh);
          root.add(mesh);
        }
        mesh.position.set(laneX(note.lane), 0.16, note.y - 4);
        mesh.visible = !note.judged;
      }
      for (const [id, mesh] of noteMeshes) {
        if (!seen.has(id)) {
          root.remove(mesh);
          noteMeshes.delete(id);
        }
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 6);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 4.4, 6.4);
      ctx.camera.lookAt(0, 1.4, -4);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        noteGeo.dispose();
        noteMats.forEach((m) => m.dispose());
        for (const mesh of noteMeshes.values()) mesh.geometry.dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g34-beat-taps",
  no: 34,
  name: "节奏敲击",
  tagline: "四线音轨音符下落，落线一瞬按下才有 PERFECT。",
  category: "休闲",
  controls: "数字键 1-4 / 点击对应轨道",
  hint: "越准分越高 · 漏音断连击 · 60 音结算",
  accent: "#22d3ee",
  createLogic,
  createStage,
};

export default def;
