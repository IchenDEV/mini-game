import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Hub } from "./Hub";

test("the adventure entry follows the deployment base and keeps the legacy entry", () => {
  render(<Hub games={[]} onPlay={() => {}} onLegacy={() => {}} />);
  expect(screen.getByRole("link", { name: /六城之心/ }).getAttribute("href"))
    .toBe(`${import.meta.env.BASE_URL}games/brasshaven/`);
  expect(screen.getByRole("button", { name: /星轨织者/ })).toBeDefined();
});
