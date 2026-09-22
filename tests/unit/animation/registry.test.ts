import { describe, expect, it } from "vitest";
import {
  ANIMATOR_NAMES,
  createAnimator,
  DEFAULT_ANIMATOR,
  parseAnimatorName,
} from "@/animation/registry";
import { InstantAnimator } from "@/animation/instant";
import { LerpAnimator } from "@/animation/lerp";
import { SolverAnimator } from "@/animation/solver/animator";

describe("parseAnimatorName", () => {
  it("accepts every known name", () => {
    for (const name of ANIMATOR_NAMES) expect(parseAnimatorName(name)).toBe(name);
  });

  it.each([null, undefined, "", "nonsense", "LERP"])(
    "falls back to the default for %s",
    (value) => {
      expect(parseAnimatorName(value)).toBe(DEFAULT_ANIMATOR);
    },
  );

  it("takes the first value when a query string repeats the parameter", () => {
    expect(parseAnimatorName(["instant", "lerp"])).toBe("instant");
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
