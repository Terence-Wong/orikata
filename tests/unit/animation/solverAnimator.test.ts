import { describe, expect, it } from "vitest";
import { SolverAnimator } from "@/animation/solver/animator";
import { TRANSITION_SECONDS } from "@/animation/types";
import { loadFold, type ResolvedModel } from "@/fold";
import { readFixture } from "../../helpers/fixtures";

const FRAME = 1 / 60;

function load(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error("fixture should load");
  return result.model;
}

function setUp(name: string) {
  const model = load(name);
  const animator = new SolverAnimator();
  const out = new Float32Array(model.vertexCount * 3);
  animator.init(model, out);
  return { model, animator, out };
}

/** Runs the animator at 60 fps until it reports idle. Returns every state it passed through. */
function runTransition(
  animator: SolverAnimator,
  from: number,
  to: number,
  onFrame?: () => void,
): string[] {
  animator.beginTransition(from, to);
  const states: string[] = [];
  for (let i = 0; i < 400; i++) {
    const state = animator.step(FRAME);
    states.push(state);
    onFrame?.();
    if (state === "idle") break;
  }
  return states;
}

function maxDeviation(out: Float32Array, model: ResolvedModel, frame: number): number {
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

describe("SolverAnimator", () => {
  it("writes into the buffer it was given", () => {
    const { animator, out } = setUp("book-fold");
    expect(animator.positions).toBe(out);
  });

  it("jumps to a frame exactly", () => {
    const { animator, out, model } = setUp("preliminary-base");
    animator.jumpTo(2);
    expect(maxDeviation(out, model, 2)).toBeLessThan(1e-5);
  });

  it("ignores a jump to a frame that does not exist", () => {
    const { animator, out, model } = setUp("book-fold");
    animator.jumpTo(0);
    animator.jumpTo(42);
    expect(maxDeviation(out, model, 0)).toBeLessThan(1e-5);
  });

  it("is idle until a transition starts", () => {
    const { animator } = setUp("book-fold");
    expect(animator.step(FRAME)).toBe("idle");
  });

  it.each([
    ["book-fold", 0, 1],
    ["book-fold-90", 0, 1],
    ["book-fold-90", 1, 2],
    ["diagonal-twice", 0, 1],
    ["diagonal-twice", 1, 2],
    ["preliminary-base", 0, 1],
    ["preliminary-base", 1, 2],
    ["preliminary-base", 2, 3],
  ])("lands %s %i→%i exactly on the author's geometry", (name, from, to) => {
    const { animator, out, model } = setUp(name);
    animator.jumpTo(from);
    const states = runTransition(animator, from, to);
    expect(states.at(-1)).toBe("idle");
    expect(maxDeviation(out, model, to)).toBeLessThan(1e-5);
  });

  it("runs backwards as well as forwards", () => {
    const { animator, out, model } = setUp("preliminary-base");
    animator.jumpTo(3);
    runTransition(animator, 3, 2);
    expect(maxDeviation(out, model, 2)).toBeLessThan(1e-5);
  });

  it("passes through tweening, settling and landing before going idle", () => {
    const { animator } = setUp("preliminary-base");
    animator.jumpTo(0);
    const states = runTransition(animator, 0, 1);
    expect(states[0]).toBe("running");
    expect(states).toContain("landing");
    expect(states.at(-1)).toBe("idle");
    expect(states.filter((s) => s === "running").length).toBeGreaterThan(40);
  });

  it("finishes in about the transition time plus the landing", () => {
    const { animator } = setUp("book-fold-90");
    animator.jumpTo(0);
    const frames = runTransition(animator, 0, 1).length;
    const seconds = frames * FRAME;
    expect(seconds).toBeGreaterThanOrEqual(TRANSITION_SECONDS);
    expect(seconds).toBeLessThan(TRANSITION_SECONDS + 0.4 + 0.2);
  });

  it.each([
    ["book-fold", 0, 1],
    ["book-fold-90", 0, 1],
    ["diagonal-twice", 1, 2],
    ["preliminary-base", 0, 1],
    ["preliminary-base", 2, 3],
  ])("holds %s %i→%i within 2%% of rest length throughout", (name, from, to) => {
    // Straight-line interpolation shortens the book fold's edges by about 50% at the halfway point.
    const { animator, out, model } = setUp(name);
    animator.jumpTo(from);
    let worst = 0;
    runTransition(animator, from, to, () => {
      worst = Math.max(worst, edgeStrain(out, model));
    });
    expect(worst).toBeLessThan(0.02);
  });

  it.each([
    ["book-fold", 0, 1],
    ["preliminary-base", 2, 3],
  ])("hands %s %i→%i over to the author's geometry without a snap", (name, from, to) => {
    // The solver settles in its own pose: for a book fold both halves rotate rather than one.
    // Seating it onto the author's pose first is what keeps the landing blend invisible, so the
    // motion should stay smooth and the handover itself should barely move anything.
    const { animator, out } = setUp(name);
    animator.jumpTo(from);
    const motion: number[] = [];
    const states: string[] = [];
    let previous: Float32Array | null = null;
    const captured = runTransition(animator, from, to, () => {
      if (previous) {
        let step = 0;
        for (let i = 0; i < out.length; i++)
          step = Math.max(step, Math.abs(out[i]! - previous[i]!));
        motion.push(step);
      }
      previous = Float32Array.from(out);
    });
    states.push(...captured);

    // Nothing lurches: no frame moves much more than the one before it.
    for (let i = 1; i < motion.length; i++) {
      expect(motion[i]!, `frame ${i}`).toBeLessThan(motion[i - 1]! * 1.6 + 0.005);
    }
    // The landing frames are the last ones, and they are where a snap would show.
    const landingMotion = motion.slice(states.indexOf("landing"));
    expect(Math.max(...landingMotion)).toBeLessThan(0.02);

    // Motion peaks in the middle, as the easing intends, rather than at the handover.
    const peak = motion.indexOf(Math.max(...motion));
    expect(peak).toBeGreaterThan(motion.length * 0.2);
    expect(peak).toBeLessThan(motion.length * 0.8);
  });

  it("keeps the model near the author's pose throughout, not only at the end", () => {
    const { animator, out, model } = setUp("book-fold");
    animator.jumpTo(0);
    let worstDrift = 0;
    runTransition(animator, 0, 1, () => {
      // Every vertex should stay inside the span the two frames occupy, with a little slack.
      for (let i = 0; i < out.length; i++) {
        const a = model.frames[0]!.coords[i]!;
        const b = model.frames[1]!.coords[i]!;
        const low = Math.min(a, b) - 0.6;
        const high = Math.max(a, b) + 0.6;
        worstDrift = Math.max(worstDrift, low - out[i]!, out[i]! - high);
      }
    });
    expect(worstDrift).toBeLessThanOrEqual(0);
  });

  it("continues smoothly when a transition interrupts one in progress", () => {
    const { animator, out, model } = setUp("book-fold-90");
    animator.jumpTo(0);
    animator.beginTransition(0, 1);
    for (let i = 0; i < 20; i++) animator.step(FRAME);
    const midway = Float32Array.from(out);
    animator.beginTransition(1, 2);
    animator.step(FRAME);
    // The warm start means no jump back to a stored frame.
    let jump = 0;
    for (let i = 0; i < out.length; i++) jump = Math.max(jump, Math.abs(out[i]! - midway[i]!));
    expect(jump).toBeLessThan(0.25);
    runTransition(animator, 1, 2);
    expect(maxDeviation(out, model, 2)).toBeLessThan(1e-5);
  });

  it("copes with a long frame time without exploding", () => {
    const { animator, out, model } = setUp("preliminary-base");
    animator.jumpTo(0);
    animator.beginTransition(0, 1);
    for (let i = 0; i < 40; i++) animator.step(0.25);
    for (const value of out) expect(Number.isFinite(value)).toBe(true);
    expect(maxDeviation(out, model, 1)).toBeLessThan(1e-5);
  });

  it.each([
    ["book-fold", 0, 1],
    ["preliminary-base", 2, 3],
  ])("reports what %s %i→%i cost the solver", (name, from, to) => {
    const { animator } = setUp(name);
    animator.jumpTo(from);
    runTransition(animator, from, to);
    const diagnostics = animator.lastTransition();
    // The tween ends with the creases close to their targets, the settle closes the gap, and the
    // handover then has almost nothing left to move.
    expect(diagnostics.residualAtTweenEndDeg).toBeGreaterThan(0);
    expect(diagnostics.residualAtTweenEndDeg).toBeLessThan(10);
    expect(diagnostics.residualAtLandingDeg).toBeLessThanOrEqual(diagnostics.residualAtTweenEndDeg);
    expect(diagnostics.settleFrames).toBeGreaterThan(0);
    expect(diagnostics.landingDistance).toBeLessThan(0.05);
  });

  it("starts each transition's diagnostics afresh", () => {
    const { animator } = setUp("book-fold-90");
    animator.jumpTo(0);
    runTransition(animator, 0, 1);
    const first = animator.lastTransition().settleFrames;
    animator.beginTransition(1, 2);
    expect(animator.lastTransition().settleFrames).toBe(0);
    expect(first).toBeGreaterThan(0);
  });

  it("still lands exactly when the frame budget only allows one iteration", () => {
    // Stands in for a model far too big for the full iteration rate: the shape will not have
    // caught up with the targets, but the step must still finish where the author put it.
    const model = load("preliminary-base");
    const animator = new SolverAnimator(1e-9);
    const out = new Float32Array(model.vertexCount * 3);
    animator.init(model, out);
    animator.jumpTo(0);
    const states = runTransition(animator, 0, 1);
    expect(states.at(-1)).toBe("idle");
    expect(maxDeviation(out, model, 1)).toBeLessThan(1e-5);
  });

  it("does nothing after dispose", () => {
    const { animator } = setUp("book-fold");
    animator.dispose();
    animator.beginTransition(0, 1);
    expect(animator.step(FRAME)).toBe("idle");
  });
});
