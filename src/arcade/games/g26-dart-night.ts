import * as THREE from "three";
import { LogicBase, clamp } from "../kit/base";
import type {
  FxEvent,
  GameDefinition,
  GameLogic,
  InputState,
  LogicContext,
  StageContext,
} from "../kit/types";
import { addLights, box, createStageShell, cylinder, Particles, setBackdrop } from "../kit/world";

export const DARTS = 9;
export const BOARD_Z = -4;

export function ringScore(off: number): number {
  if (off < 0.25) return 50;
  if (off < 0.6) return 25;
  if (off < 1.0) return 10;
  if (off < 1.4) return 5;
  return 0;
}

export interface GView {
  crossX: number;
  crossY: number;
  dartsLeft: number;
  last: { x: number; y: number; score: number } | null;
  bulls: number;
  onBoard: number;
  fx: FxEvent[];
  alive: boolean;
}

function createLogic(ctx: LogicContext): GameLogic {
  const base = new LogicBase(ctx, { hint: "准星会漂 · 看准落点最稳的一瞬出手" });
  const v: GView = {
    crossX: 0,
    crossY: 0,
    dartsLeft: DARTS,
    last: null,
    bulls: 0,
    onBoard: 0,
    fx: [],
    alive: true,
  };

  const reset = () => {
    base.clearHud();
    v.crossX = 0;
    v.crossY = 0;
    v.dartsLeft = DARTS;
    v.last = null;
    v.bulls = 0;
    v.onBoard = 0;
    v.fx = [];
    v.alive = true;
  };
  reset();

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
      const wob = 0.25 + base.elapsed * 0.02;
      v.crossX = clamp(Math.sin(base.elapsed * 1.3) * 1.25, -1.25, 1.25) + Math.sin(base.elapsed * 5.7) * wob * 0.3;
      v.crossY = clamp(Math.sin(base.elapsed * 2.1) * 0.95, -1, 1) + Math.cos(base.elapsed * 4.3) * wob * 0.3;

      if (input.actionPressed && v.dartsLeft > 0) {
        v.dartsLeft -= 1;
        const off = Math.hypot(v.crossX, v.crossY);
        const score = ringScore(off);
        v.last = { x: v.crossX, y: v.crossY, score };
        base.score += score;
        if (score === 50) {
          v.bulls += 1;
          base.say("正中红心 +50", 1);
          ctx.audio.play("pickup", 1);
        } else if (score > 0) {
          v.onBoard += 1;
          ctx.audio.play("swap", 0.5);
          base.say(`+${score}`, 0.7);
        } else {
          ctx.audio.play("tick");
          base.say("脱靶", 0.7);
        }
        v.fx.push({ x: v.crossX, y: v.crossY, z: BOARD_Z, color: score > 0 ? 0xffd166 : 0x94a5c9, count: 8 });
      }

      if (v.dartsLeft === 0) {
        const win = base.score >= 100;
        base.detail = `上靶 ${v.onBoard + v.bulls} / ${DARTS} · 红心 ×${v.bulls}`;
        base.finish(win ? "win" : "lose");
        return;
      }

      base.setFields([
        { label: "剩余", value: `${v.dartsLeft} 支` },
        { label: "红心", value: `×${v.bulls}` },
        { label: "上靶", value: String(v.onBoard) },
      ]);
    },
    snapshot: () => base.snapshot(),
  };
}

function createStage(ctx: StageContext) {
  return createStageShell(ctx, (root) => {
    setBackdrop(ctx.scene, 0x140d10, 0x3d2430);
    addLights(ctx.scene, ctx.accent);

    const wall = box(9, 6.4, 0.5, 0x4a3040, { roughness: 0.9 });
    wall.position.set(0, 2.4, BOARD_Z - 0.4);
    root.add(wall);

    const boardGroup = new THREE.Group();
    const board = cylinder(1.5, 1.5, 0.16, 32);
    const boardMesh = new THREE.Mesh(
      board,
      new THREE.MeshStandardMaterial({ color: 0x1c2b22, roughness: 0.75 }),
    );
    boardMesh.rotation.x = Math.PI / 2;
    boardGroup.add(boardMesh);
    const ringSpecs: [number, number, number][] = [
      [1.4, 0.06, 0xbfc9d9],
      [1.0, 0.06, 0x2f6f4f],
      [0.6, 0.06, 0xc9b26b],
      [0.25, 0.07, 0xc0392b],
    ];
    for (const [r, tube, color] of ringSpecs) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, tube, 8, 40),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.6 }),
      );
      ring.position.z = 0.1;
      boardGroup.add(ring);
    }
    boardGroup.position.set(0, 2.4, BOARD_Z);
    root.add(boardGroup);

    const crosshair = new THREE.Group();
    const chMat = new THREE.MeshBasicMaterial({ color: 0xff5d73 });
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.01), chMat);
    const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.34, 0.01), chMat);
    crosshair.add(h1, h2);
    root.add(crosshair);

    const dart = new THREE.Group();
    const body = new THREE.Mesh(
      cylinder(0.035, 0.035, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8d8e8, metalness: 0.7, roughness: 0.3 }),
    );
    body.rotation.x = Math.PI / 2;
    dart.add(body);
    dart.visible = false;
    root.add(dart);

    const particles = new Particles(ctx.scene, 40);
    const paint = (dt: number, _time: number, _input: InputState, logic: GameLogic) => {
      const v = logic.view as GView | undefined;
      if (!v) return;
      crosshair.position.set(v.crossX, 2.4 + v.crossY, BOARD_Z + 0.25);
      if (v.last) {
        dart.visible = true;
        dart.position.set(v.last.x, 2.4 + v.last.y, BOARD_Z + 0.42);
      }

      for (const fx of v.fx) particles.burst(fx.x, fx.y, fx.z, fx.color, fx.count ?? 8);
      v.fx.length = 0;
      particles.update(dt);

      ctx.camera.position.set(0, 2.4, 3.4);
      ctx.camera.lookAt(0, 2.4, BOARD_Z);
      void dt;
    };

    return {
      paint,
      onDispose: () => {
        board.dispose();
        (boardMesh.material as THREE.Material).dispose();
        (chMat as THREE.Material).dispose();
      },
    };
  });
}

const def: GameDefinition = {
  id: "g26-dart-night",
  no: 26,
  name: "飞镖之夜",
  tagline: "准星越飘越野，抓住它最稳的一瞬。",
  category: "射击",
  controls: "空格 / 点击 掷镖",
  hint: "红心 50 · 内环 25 · 脱靶零分 · 9 支镖",
  accent: "#f472b6",
  createLogic,
  createStage,
};

export default def;
