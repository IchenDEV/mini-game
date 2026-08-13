// Frame scheduler: lets async game scripts await frames/buttons.
import { Input, type Button } from "./input";

type Resolver = () => void;
let queue: Resolver[] = [];

export function nextFrame(): Promise<void> {
  return new Promise((r) => queue.push(r));
}

export async function waitFrames(n: number) {
  for (let i = 0; i < n; i++) await nextFrame();
}

export function flushFrame() {
  const q = queue;
  queue = [];
  for (const r of q) r();
}

export async function waitButton(...bs: Button[]): Promise<Button> {
  for (;;) {
    await nextFrame();
    for (const b of bs) if (Input.pressed(b)) return b;
  }
}
