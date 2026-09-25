import { describe, expect, it } from "vitest";
import { LerpAnimator } from "@/animation/lerp";
import { SolverAnimator } from "@/animation/solver/animator";
import type { FoldAnimator } from "@/animation/types";
import { loadFold, type ResolvedModel } from "@/fold";
import { readFixture } from "../../helpers/fixtures";

function load(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error("fixture should load");
  return result.model;
}

function setUp(make: () => FoldAnimator, name = "book-fold-90") {
  const model = load(name);
  const animator = make();
  const out = new Float32Array(model.vertexCount * 3);
  animator.init(model, out);
  return { model, animator, out };
}

function deviation(out: Float32Array, model: ResolvedModel, frame: number): number {
  const coords = model.frames[frame]!.coords;
  let worst = 0;
  for (let i = 0; i < out.length; i++) worst = Math.max(worst, Math.abs(out[i]! - coords[i]!));
  return worst;
}

function edgeStrain(out: Float32Array, model: ResolvedModel): number {
  const flat = model.frames[0]!.coords;
  let worst = 0;
  for (const [a, b] of model.edgesVertices) {
    const rest = Math.hypot(
      flat[3 * a]! - flat[3 * b]!,
      flat[3 * a + 1]! - flat[3 * b + 1]!,
      flat[3 * a + 2]! - flat[3 * b + 2]!,
    );
    if (rest === 0) continue;
    const now = Math.hypot(
      out[3 * a]! - out[3 * b]!,
      out[3 * a + 1]! - out[3 * b + 1]!,
      out[3 * a + 2]! - out[3 * b + 2]!,
    );
    worst = Math.max(worst, Math.abs(now - rest) / rest);
  }
  return worst;
}

const ANIMATORS: [string, () => FoldAnimator][] = [
  ["lerp", () => new LerpAnimator()],
  ["solver", () => new SolverAnimator()],
];

describe.each(ANIMATORS)("%s seek", (_name, make) => {
  it("lands exactly on the start and end frames", () => {
    const { animator, out, model } = setUp(make);
    animator.seek(0, 1, 0);
    expect(deviation(out, model, 0)).toBeLessThan(1e-5);
    animator.seek(0, 1, 1);
    expect(deviation(out, model, 1)).toBeLessThan(1e-5);
  });

  it("puts the model somewhere between the two frames part-way through", () => {
    const { animator, out, model } = setUp(make);
    animator.seek(0, 1, 0.5);
    expect(deviation(out, model, 0)).toBeGreaterThan(1e-4);
    expect(deviation(out, model, 1)).toBeGreaterThan(1e-4);
  });

  it("is repeatable: seeking to the same place twice settles on the same model", () => {
    // A seek may leave the solver still settling, which it finishes over the next frames; what
    // must agree is where it settles, not how far one call got on a busy machine.
    const { animator, out } = setUp(make);
    const settle = () => {
      for (let frame = 0; frame < 600 && animator.step(1 / 60) !== "idle"; frame++);
    };
    animator.seek(0, 1, 0.4);
    settle();
    const first = Float32Array.from(out);
    animator.seek(0, 1, 1);
    animator.seek(0, 1, 0.4);
    settle();
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo(first[i]!, 2);
  });

  it("works backwards as well as forwards", () => {
    const { animator, out, model } = setUp(make);
    for (const s of [0.2, 0.4, 0.6, 0.8, 0.6, 0.4, 0.2, 0]) animator.seek(0, 1, s);
    expect(deviation(out, model, 0)).toBeLessThan(1e-5);
  });

  it("clamps a progress outside the range", () => {
    const { animator, out, model } = setUp(make);
    animator.seek(0, 1, -3);
    expect(deviation(out, model, 0)).toBeLessThan(1e-5);
    animator.seek(0, 1, 7);
    expect(deviation(out, model, 1)).toBeLessThan(1e-5);
  });

  it("does nothing for a frame that does not exist", () => {
    const { animator, out, model } = setUp(make);
    animator.jumpTo(0);
    animator.seek(0, 42, 0.5);
    expect(deviation(out, model, 0)).toBeLessThan(1e-5);
  });

  it("moves smoothly as the scrubber is dragged", () => {
    const { animator, out } = setUp(make, "preliminary-base");
    animator.seek(0, 1, 0);
    let previous = Float32Array.from(out);
    const steps: number[] = [];
    for (let s = 0.05; s <= 1.0001; s += 0.05) {
      animator.seek(0, 1, Math.min(s, 1));
      let moved = 0;
      for (let i = 0; i < out.length; i++)
        moved = Math.max(moved, Math.abs(out[i]! - previous[i]!));
      steps.push(moved);
      previous = Float32Array.from(out);
    }
    // No single nudge of the scrubber jumps the model further than a fifth of its size.
    expect(Math.max(...steps)).toBeLessThan(0.4);
  });
});

describe("solver seek", () => {
  it("never changes the stored frames, so a step played after scrubbing lands where it should", () => {
    const model = load("book-fold-90");
    const animator = new SolverAnimator();
    const out = new Float32Array(model.vertexCount * 3);
    animator.init(model, out);
    animator.jumpTo(1);
    animator.seek(0, 1, 0.5);
    animator.beginTransition(1, 2);
    for (let i = 0; i < 600 && animator.step(1 / 60) !== "idle"; i++);
    animator.jumpTo(0);
    expect(deviation(out, model, 0)).toBeLessThan(1e-5);
  });

  it("keeps settling after a move of the scrubber until the solver has converged", () => {
    const model = load("crane");
    const animator = new SolverAnimator();
    const out = new Float32Array(model.vertexCount * 3);
    animator.init(model, out);
    animator.jumpTo(9);
    animator.seek(9, 10, 0.6);
    let frames = 0;
    while (animator.step(1 / 60) !== "idle" && frames < 600) frames++;
    expect(frames).toBeGreaterThan(0);
    expect(frames).toBeLessThan(600);
  });

  it("holds the paper rigid while scrubbing, which interpolation does not", () => {
    const model = load("book-fold");
    const measure = (animator: FoldAnimator) => {
      const out = new Float32Array(model.vertexCount * 3);
      animator.init(model, out);
      let worst = 0;
      for (let s = 0; s <= 1.0001; s += 0.05) {
        animator.seek(0, 1, Math.min(s, 1));
        worst = Math.max(worst, edgeStrain(out, model));
      }
      return worst;
    };
    expect(measure(new SolverAnimator())).toBeLessThan(measure(new LerpAnimator()) / 4);
  });
});
