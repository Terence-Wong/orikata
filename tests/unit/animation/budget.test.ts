import { describe, expect, it } from "vitest";
import {
  MAX_SUBSTEPS_PER_FRAME,
  planSubsteps,
  SUBSTEPS_PER_SECOND,
} from "@/animation/solver/budget";

const CHEAP = 0.002; // ms per substep, about what a small model costs
const BUDGET = 4;

describe("planSubsteps", () => {
  it("runs the full rate when the model is cheap enough", () => {
    expect(planSubsteps(1 / 60, CHEAP, BUDGET)).toBe(Math.round(SUBSTEPS_PER_SECOND / 60));
  });

  it("scales with the frame time, so the fold takes the same wall-clock time at any frame rate", () => {
    const sixty = planSubsteps(1 / 60, CHEAP, BUDGET);
    const oneTwenty = planSubsteps(1 / 120, CHEAP, BUDGET);
    expect(oneTwenty).toBe(Math.round(sixty / 2));
  });

  it("cuts the count to fit the time budget on an expensive model", () => {
    // 0.5 ms a substep leaves room for 8 in a 4 ms budget, well under what the rate asks for.
    expect(planSubsteps(1 / 60, 0.5, BUDGET)).toBe(8);
  });

  it("always runs at least one substep, however expensive", () => {
    expect(planSubsteps(1 / 60, 1000, BUDGET)).toBe(1);
    expect(planSubsteps(1 / 60, Number.POSITIVE_INFINITY, BUDGET)).toBe(1);
  });

  it("never runs more than the per-frame ceiling, however long the frame was", () => {
    expect(planSubsteps(2, CHEAP, BUDGET)).toBe(MAX_SUBSTEPS_PER_FRAME);
  });

  it("copes with a first frame that has no cost measurement yet", () => {
    expect(planSubsteps(1 / 60, 0, BUDGET)).toBe(Math.round(SUBSTEPS_PER_SECOND / 60));
  });

  it("treats a zero or negative frame time as one substep rather than none", () => {
    expect(planSubsteps(0, CHEAP, BUDGET)).toBe(1);
    expect(planSubsteps(-1, CHEAP, BUDGET)).toBe(1);
  });
});
