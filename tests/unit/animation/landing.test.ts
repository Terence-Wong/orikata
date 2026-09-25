import { describe, expect, it } from "vitest";
import { loadFold, type ResolvedModel } from "@/fold";
import { SolverAnimator } from "@/animation/solver/animator";
import { readFixture, VALID_FIXTURES } from "../../helpers/fixtures";

/**
 * The solver has to reach the author's shape by itself; the landing blend is only meant to absorb
 * what is too small to see. When it has not got there, the model visibly snaps into place at the
 * end of a step, or when the scrubber reaches 100%. This is measured on every bundled model.
 */
const LARGEST_JUMP = 0.03;

function load(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error(`${name} should load`);
  return result.model;
}

/** The model's size in its flat state, which jumps are measured against. */
function sizeOf(model: ResolvedModel): number {
  const c = model.frames[0]!.coords;
  let size = 0;
  for (let i = 0; i < c.length; i += 3) {
    for (let j = i + 3; j < c.length; j += 3) {
      size = Math.max(
        size,
        Math.hypot(c[i]! - c[j]!, c[i + 1]! - c[j + 1]!, c[i + 2]! - c[j + 2]!),
      );
    }
  }
  return size;
}

function largestMove(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let worst = 0;
  for (let i = 0; i < a.length; i += 3) {
    worst = Math.max(
      worst,
      Math.hypot(a[i]! - b[i]!, a[i + 1]! - b[i + 1]!, a[i + 2]! - b[i + 2]!),
    );
  }
  return worst;
}

describe.each(VALID_FIXTURES)("%s lands every step without a visible jump", (name) => {
  const model = load(name);
  const size = sizeOf(model);
  const steps = model.frames.slice(1).map((frame) => [frame.index - 1, frame.index] as const);

  it.each(steps)("when step %i → %i plays", (from, to) => {
    const out = new Float32Array(model.vertexCount * 3);
    // A generous time budget, as on a fast laptop: this is about the solver, not the budget.
    const animator = new SolverAnimator(1000);
    animator.init(model, out);
    animator.jumpTo(from);
    animator.beginTransition(from, to);
    for (let frame = 0; frame < 600 && animator.step(1 / 60) !== "idle"; frame++);
    expect(animator.lastTransition().landingDistance / size).toBeLessThan(LARGEST_JUMP);
  });

  it.each(steps)("when the scrubber for step %i → %i reaches the end", (from, to) => {
    const out = new Float32Array(model.vertexCount * 3);
    const animator = new SolverAnimator(1000);
    animator.init(model, out);
    animator.jumpTo(from);
    // Dragged along, as a person would, then settled at 99% before the last nudge.
    for (let s = 0.05; s < 0.99; s += 0.05) {
      animator.seek(from, to, s);
      for (let frame = 0; frame < 3; frame++) animator.step(1 / 60);
    }
    animator.seek(from, to, 0.99);
    for (let frame = 0; frame < 120 && animator.step(1 / 60) !== "idle"; frame++);
    const nearlyThere = Float32Array.from(out);
    animator.seek(from, to, 1);
    expect(largestMove(nearlyThere, out) / size).toBeLessThan(LARGEST_JUMP);
  });
});

describe("on a slow device, frames 0.1 s apart and 4 ms of solver time each", () => {
  // Settling is bounded by how much the solver has done, not by how much time has passed, so a
  // slow device takes longer to settle but still gets there. Each iteration is taken to cost what
  // one of the crane's does on a laptop (31 µs), so the test does not depend on how busy the
  // machine running it is. The steps are the ones the solver works out by itself, which the paper
  // has to bend for; plain and petal folds follow the rigid path and land exactly regardless.
  const model = load("crane");
  const size = sizeOf(model);
  const device = () => new SolverAnimator(4, 0.031);
  const steps = ["Reverse fold the neck", "Reverse fold the tail", "Reverse fold the head"].map(
    (title) => {
      const to = model.frames.findIndex((frame) => frame.title === title);
      return [title, to - 1, to] as const;
    },
  );

  it.each(steps)("the crane's %s still lands without a jump", (_, from, to) => {
    const out = new Float32Array(model.vertexCount * 3);
    const animator = device();
    animator.init(model, out);
    animator.jumpTo(from);
    animator.beginTransition(from, to);
    for (let frame = 0; frame < 2000 && animator.step(0.1) !== "idle"; frame++);
    expect(animator.lastTransition().landingDistance / size).toBeLessThan(LARGEST_JUMP);
  });

  it.each(steps)("the crane's scrubber for %s ends without a jump from half-way", (_, from, to) => {
    const out = new Float32Array(model.vertexCount * 3);
    const animator = device();
    animator.init(model, out);
    animator.jumpTo(to);
    for (const s of [0.45, 0.98]) {
      animator.seek(from, to, s);
      for (let frame = 0; frame < 2000 && animator.step(0.1) !== "idle"; frame++);
    }
    const nearlyThere = Float32Array.from(out);
    animator.seek(from, to, 1);
    expect(largestMove(nearlyThere, out) / size).toBeLessThan(LARGEST_JUMP);
  });
});
