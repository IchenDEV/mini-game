// GB button input from keyboard + on-screen touch controls.
export type Button = "A" | "B" | "START" | "SELECT" | "UP" | "DOWN" | "LEFT" | "RIGHT";

const KEYMAP: Record<string, Button> = {
  z: "A", Z: "A",
  x: "B", X: "B",
  Enter: "START",
  Shift: "SELECT",
  ArrowUp: "UP", w: "UP", W: "UP",
  ArrowDown: "DOWN", s: "DOWN", S: "DOWN",
  ArrowLeft: "LEFT", a: "LEFT", A: "LEFT",
  ArrowRight: "RIGHT", d: "RIGHT", D: "RIGHT",
};

class InputManager {
  private down = new Set<Button>();
  private prev = new Set<Button>();
  private cur = new Set<Button>();
  turbo = false;
  onAnyInput: (() => void) | null = null;

  init() {
    window.addEventListener("keydown", (e) => {
      if (e.key === " ") {
        this.turbo = true;
        e.preventDefault();
        return;
      }
      const b = KEYMAP[e.key];
      if (b) {
        this.down.add(b);
        this.onAnyInput?.();
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.key === " ") {
        this.turbo = false;
        return;
      }
      const b = KEYMAP[e.key];
      if (b) this.down.delete(b);
    });
    document.querySelectorAll<HTMLButtonElement>("button[data-k]").forEach((btn) => {
      const b = btn.dataset.k as Button;
      const start = (e: Event) => {
        e.preventDefault();
        this.down.add(b);
        this.onAnyInput?.();
      };
      const end = (e: Event) => {
        e.preventDefault();
        this.down.delete(b);
      };
      btn.addEventListener("pointerdown", start);
      btn.addEventListener("pointerup", end);
      btn.addEventListener("pointerleave", end);
      btn.addEventListener("pointercancel", end);
    });
    window.addEventListener("blur", () => this.down.clear());
  }

  beginFrame() {
    this.prev = this.cur;
    this.cur = new Set(this.down);
  }

  held(b: Button): boolean {
    return this.cur.has(b);
  }
  pressed(b: Button): boolean {
    return this.cur.has(b) && !this.prev.has(b);
  }
  anyPressed(...bs: Button[]): Button | null {
    for (const b of bs) if (this.pressed(b)) return b;
    return null;
  }
  heldDir(): Button | null {
    for (const b of ["DOWN", "UP", "LEFT", "RIGHT"] as Button[]) if (this.held(b)) return b;
    return null;
  }
}

export const Input = new InputManager();
