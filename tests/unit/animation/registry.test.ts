import { describe, expect, it } from "vitest";
import {
  ANIMATOR_NAMES,
  chooseAnimator,
  createAnimator,
  DEFAULT_ANIMATOR,
  parseAnimatorName,
  SOLVER_VERTEX_LIMIT,
} from "@/animation/registry";
import { InstantAnimator } from "@/animation/instant";
import { LerpAnimator } from "@/animation/lerp";
import { SolverAnimator } from "@/animation/solver/animator";

describe("parseAnimatorName", () => {
  it("accepts every known name", () => {
    for (const name of ANIMATOR_NAMES) expect(parseAnimatorName(name)).toBe(name);
  });

  it.each([null, undefined, "", "nonsense", "LERP"])(
    "reports no choice for %s, so the model decides",
    (value) => {
      expect(parseAnimatorName(value)).toBeUndefined();
    },
  );

  it("takes the first value when a query string repeats the parameter", () => {
    expect(parseAnimatorName(["instant", "lerp"])).toBe("instant");
  });
});

describe("chooseAnimator", () => {
  it("uses the solver for a model small enough to afford it", () => {
    expect(chooseAnimator(undefined, 9)).toBe("solver");
    expect(chooseAnimator(undefined, SOLVER_VERTEX_LIMIT)).toBe("solver");
    expect(DEFAULT_ANIMATOR).toBe("solver");
  });

  it("falls back to interpolation for a model the solver cannot keep up with", () => {
    expect(chooseAnimator(undefined, SOLVER_VERTEX_LIMIT + 1)).toBe("lerp");
    expect(chooseAnimator(undefined, 10_000)).toBe("lerp");
  });

  it("honours an explicit choice at any size, so a big model can still be inspected", () => {
    expect(chooseAnimator("solver", 10_000)).toBe("solver");
    expect(chooseAnimator("lerp", 9)).toBe("lerp");
    expect(chooseAnimator("instant", 10_000)).toBe("instant");
  });

  it("draws the line where the measurements put it", () => {
    // A 60 fps budget allows about 725 vertices and a 120 Hz one about 360, on the machine the
    // comparison report used.
    expect(SOLVER_VERTEX_LIMIT).toBe(600);
  });
});

describe("createAnimator", () => {
  it("builds the animator named", () => {
    expect(createAnimator("instant")).toBeInstanceOf(InstantAnimator);
    expect(createAnimator("lerp")).toBeInstanceOf(LerpAnimator);
    expect(createAnimator("solver")).toBeInstanceOf(SolverAnimator);
  });

  it("returns a fresh instance each time", () => {
    expect(createAnimator("lerp")).not.toBe(createAnimator("lerp"));
  });
});
