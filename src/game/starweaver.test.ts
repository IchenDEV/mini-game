import { describe, expect, it } from "vitest";
import {
  BEST_SCORE_KEY,
  chooseNextTarget,
  clamp,
  createSeededRandom,
  distance,
  distanceSquared,
  formatTime,
  scoreForStitch,
  timeBonusForStitch,
  updateBestScore,
} from "./starweaver";

describe("starweaver geometry and display helpers", () => {
  it("measures vector distances without mutating the inputs", () => {
    const start = { x: -1, y: 2 };
    const end = { x: 2, y: 6 };

    expect(distanceSquared(start, end)).toBe(25);
    expect(distance(start, end)).toBe(5);
    expect(start).toEqual({ x: -1, y: 2 });
    expect(end).toEqual({ x: 2, y: 6 });
  });

  it("clamps values at and beyond both boundaries", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(10, 0, 10)).toBe(10);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("formats remaining milliseconds as a countdown", () => {
    expect(formatTime(-50)).toBe("00:00");
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(1)).toBe("00:01");
    expect(formatTime(59_001)).toBe("01:00");
    expect(formatTime(75_000)).toBe("01:15");
    expect(formatTime(Number.NaN)).toBe("00:00");
  });
});

describe("starweaver deterministic target selection", () => {
  const anchors = [
    { id: "current", x: 0, y: 0 },
    { id: "near", x: 10, y: 0 },
    { id: "far", x: 100, y: 0 },
  ];

  it("produces the same stable stream from the same seed", () => {
    const first = createSeededRandom("orbit-7");
    const second = createSeededRandom("orbit-7");
    const firstValues = Array.from({ length: 8 }, () => first());
    const secondValues = Array.from({ length: 8 }, () => second());

    expect(firstValues).toEqual(secondValues);
    expect(firstValues.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(firstValues).size).toBeGreaterThan(1);
  });

  it("never repeats the current anchor and returns null without alternatives", () => {
    expect(chooseNextTarget(anchors, "current", anchors[0], () => 0)?.id).not.toBe(
      "current",
    );
    expect(
      chooseNextTarget([anchors[0]], "current", anchors[0], () => 0.5),
    ).toBeNull();
    expect(chooseNextTarget([], "current", anchors[0], () => 0.5)).toBeNull();
  });

  it("weights distant anchors more heavily", () => {
    const picks = Array.from({ length: 1_000 }, (_, seed) =>
      chooseNextTarget(anchors, "current", anchors[0], createSeededRandom(seed)),
    );
    const farPicks = picks.filter((anchor) => anchor?.id === "far").length;
    const nearPicks = picks.filter((anchor) => anchor?.id === "near").length;

    expect(farPicks).toBeGreaterThan(nearPicks * 20);
  });
});

describe("starweaver rewards and best score", () => {
  it("increases stitch score and time rewards with combo", () => {
    expect(scoreForStitch(1, 0)).toBeGreaterThan(scoreForStitch(0, 0));
    expect(scoreForStitch(4, 0)).toBeGreaterThan(scoreForStitch(1, 0));
    expect(scoreForStitch(4, 2)).toBeGreaterThan(scoreForStitch(4, 0));
    expect(timeBonusForStitch(5)).toBeGreaterThan(timeBonusForStitch(0));
  });

  it("normalizes invalid reward inputs to safe non-negative values", () => {
    expect(scoreForStitch(-4, -2)).toBe(scoreForStitch(0, 0));
    expect(scoreForStitch(Number.NaN, Number.POSITIVE_INFINITY)).toBe(
      scoreForStitch(0, 0),
    );
    expect(timeBonusForStitch(-1)).toBe(timeBonusForStitch(0));
  });

  it("updates only a genuine best score", () => {
    const values = new Map<string, string>([[BEST_SCORE_KEY, "420"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(updateBestScore(300, storage)).toBe(420);
    expect(values.get(BEST_SCORE_KEY)).toBe("420");
    expect(updateBestScore(501.9, storage)).toBe(501);
    expect(values.get(BEST_SCORE_KEY)).toBe("501");
  });

  it("survives corrupt or unavailable storage", () => {
    const corrupt = {
      getItem: () => "not-a-score",
      setItem: () => undefined,
    };
    const unavailable = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(updateBestScore(99, corrupt)).toBe(99);
    expect(updateBestScore(99, unavailable)).toBe(99);
    expect(updateBestScore(Number.NaN, unavailable)).toBe(0);
    expect(updateBestScore(99)).toBe(99);
  });
});
