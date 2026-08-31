import { vi } from "vitest";
import { emptyInput, type AudioCue, type GameLogic, type InputState, type LogicContext } from "../kit/types";

export function fakeAudio(): AudioCue {
  return { enabled: true, play: vi.fn() };
}

export function makeCtx(bestKey = "test-key"): LogicContext {
  return { audio: fakeAudio(), bestKey };
}

export interface InputOverrides {
  axisX?: number;
  axisY?: number;
  action?: boolean;
  actionPressed?: boolean;
  actionReleased?: boolean;
  pointerX?: number;
  pointerY?: number;
  pointerActive?: boolean;
  padPressed?: number[];
}

export function input(overrides: InputOverrides = {}): InputState {
  return { ...emptyInput(), ...overrides };
}

export const DT = 1 / 60;

/** Start the run and step it for `seconds` of simulated time. */
export function run(
  logic: GameLogic,
  seconds: number,
  provide?: (elapsed: number, frame: number) => InputOverrides,
): void {
  logic.start();
  const frames = Math.round(seconds * 60);
  for (let frame = 0; frame < frames; frame += 1) {
    const elapsed = frame * DT;
    const overrides = provide ? provide(elapsed, frame) : {};
    logic.step(DT, input(overrides));
    // Mirror the shell: the simulation only ticks while playing.
    if (logic.snapshot().status !== "playing") break;
  }
}

/** Start and step a single frame with the given input. */
export function frame(logic: GameLogic, overrides: InputOverrides = {}): void {
  logic.start();
  logic.step(DT, input(overrides));
}
