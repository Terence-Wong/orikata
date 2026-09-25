import { describe, expect, it } from "vitest";
import { RigidPath } from "@/animation/rigidPath";
import { SolverAnimator } from "@/animation/solver/animator";
import { loadFold, type ResolvedModel } from "@/fold";
import { deepestCrossing } from "../../helpers/crossings";
import { readFixture, VALID_FIXTURES } from "../../helpers/fixtures";

/**
 * A step the paper can make rigidly, like a plain fold of a stack of layers, is played exactly as
 * rigid folding, so no layer passes through another and nothing is left for the landing blend.
 */
const DEEPEST = 0.001;

function load(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error(`${name} should load`);
  return result.model;
}

/** Each example with its steps sorted by how rigidly they can be folded. */
const EXAMPLES = VALID_FIXTURES.map((name) => {
  const model = load(name);
  const path = new RigidPath(model);
  const steps = model.frames.slice(1).map((frame) => [frame.index - 1, frame.index] as const);
  return {
    name,
    model,
    crossing: deepestCrossing(model),
    rigidSteps: steps.filter(([from, to]) => path.isRigid(from, to)),
    guidedSteps: steps.filter(
      ([from, to]) => !path.isRigid(from, to) && path.isNearlyRigid(from, to),
    ),
  };
});

// A suite with no tests fails, so an example with no steps of a kind is left out of that kind.
describe.each(EXAMPLES.filter((example) => example.rigidSteps.length > 0))(
  "$name: steps that can be folded rigidly",
  ({ model, crossing, rigidSteps }) => {
    it.each(rigidSteps)("play %i → %i without paper passing through paper", (from, to) => {
      const out = new Float32Array(model.vertexCount * 3);
      const animator = new SolverAnimator(1000);
      animator.init(model, out);
      animator.jumpTo(from);
      animator.beginTransition(from, to);
      let deepest = 0;
      for (let frame = 0; frame < 600 && animator.step(1 / 60) !== "idle"; frame++) {
        deepest = Math.max(deepest, crossing(out));
      }
      expect(deepest).toBeLessThan(DEEPEST);
      expect(animator.lastTransition().landingDistance).toBeLessThan(1e-6);
    });

    it.each(rigidSteps)("scrub %i → %i without paper passing through paper", (from, to) => {
      const out = new Float32Array(model.vertexCount * 3);
      const animator = new SolverAnimator(1000);
      animator.init(model, out);
      animator.jumpTo(to);
      for (const s of [0.9, 0.6, 0.3, 0.05, 0.5]) {
        animator.seek(from, to, s);
        expect(crossing(out), `at ${s}`).toBeLessThan(DEEPEST);
      }
    });
  },
);

/**
 * A step that is nearly rigid, like a petal fold, whose fold angles change at different rates, is
 * played along the rigid path with the solver closing it up. It stays close to paper that does not
 * pass through itself, and lands exactly.
 */
const DEEPEST_GUIDED = 0.02;

describe.each(EXAMPLES.filter((example) => example.guidedSteps.length > 0))(
  "$name: steps that are nearly rigid",
  ({ model, crossing, guidedSteps }) => {
    it.each(guidedSteps)(
      "play %i → %i staying clear of paper passing through paper, and land exactly",
      (from, to) => {
        const out = new Float32Array(model.vertexCount * 3);
        const animator = new SolverAnimator(1000);
        animator.init(model, out);
        animator.jumpTo(from);
        animator.beginTransition(from, to);
        let deepest = 0;
        for (let frame = 0; frame < 600 && animator.step(1 / 60) !== "idle"; frame++) {
          deepest = Math.max(deepest, crossing(out));
        }
        expect(deepest).toBeLessThan(DEEPEST_GUIDED);
        expect(animator.lastTransition().landingDistance).toBe(0);
      },
    );

    it.each(guidedSteps)(
      "scrub %i → %i to the same shape however the slider got there",
      (from, to) => {
        const out = new Float32Array(model.vertexCount * 3);
        const animator = new SolverAnimator(1000);
        animator.init(model, out);
        animator.jumpTo(to);
        animator.seek(from, to, 0.3);
        animator.seek(from, to, 0.6);
        const dragged = Float32Array.from(out);
        animator.jumpTo(from);
        animator.seek(from, to, 0.6);
        for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo(dragged[i]!, 6);
        expect(crossing(out)).toBeLessThan(DEEPEST_GUIDED);
      },
    );
  },
);
