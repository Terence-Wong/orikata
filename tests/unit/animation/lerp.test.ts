import { describe, expect, it } from "vitest";
import { easeInOutCubic } from "@/animation/easing";
import { LerpAnimator } from "@/animation/lerp";
import { TRANSITION_SECONDS } from "@/animation/types";
import { loadFold, type ResolvedModel } from "@/fold";
import { readFixture } from "../../helpers/fixtures";

function model(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error("fixture should load");
  return result.model;
}

function setUp(name = "book-fold-90") {
  const m = model(name);
  const animator = new LerpAnimator();
  const out = new Float32Array(m.vertexCount * 3);
  animator.init(m, out);
  return { model: m, animator, out };
}

function expectMatchesFrame(out: Float32Array, model: ResolvedModel, frame: number) {
  const coords = model.frames[frame]!.coords;
  for (let i = 0; i < out.length; i++) {
    expect(out[i], `component ${i}`).toBeCloseTo(coords[i]!, 6);
  }
}

describe("easeInOutCubic", () => {
  it("is pinned at both ends and symmetric about the middle", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 12);
  });

  it("is monotonic and stays inside [0, 1]", () => {
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const value = easeInOutCubic(Math.min(t, 1));
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });

  it("starts and ends slowly", () => {
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });
});

describe("LerpAnimator", () => {
  it("writes into the buffer it was given", () => {
    const { animator, out } = setUp();
    expect(animator.positions).toBe(out);
  });

  it("jumps to a frame exactly", () => {
    const { animator, out, model: m } = setUp();
    animator.jumpTo(2);
    expectMatchesFrame(out, m, 2);
  });

  it("ignores a jump to a frame that does not exist", () => {
    const { animator, out, model: m } = setUp();
    animator.jumpTo(0);
    animator.jumpTo(99);
    expectMatchesFrame(out, m, 0);
  });

  it("stays on the starting frame until the first step", () => {
    const { animator, out, model: m } = setUp();
    animator.jumpTo(0);
    animator.beginTransition(0, 2);
    expectMatchesFrame(out, m, 0);
  });

  it("reports running until the transition is over, then idle", () => {
    const { animator } = setUp();
    animator.beginTransition(0, 1);
    expect(animator.step(TRANSITION_SECONDS / 2)).toBe("running");
    expect(animator.step(TRANSITION_SECONDS / 2)).toBe("idle");
    expect(animator.step(0.1)).toBe("idle");
  });

  it("lands exactly on the destination frame", () => {
    const { animator, out, model: m } = setUp();
    animator.beginTransition(0, 2);
    animator.step(TRANSITION_SECONDS);
    expectMatchesFrame(out, m, 2);
  });

  it("lands exactly even when the last step overshoots", () => {
    const { animator, out, model: m } = setUp();
    animator.beginTransition(0, 1);
    animator.step(TRANSITION_SECONDS * 10);
    expectMatchesFrame(out, m, 1);
  });

  it("interpolates each vertex along a straight line with eased timing", () => {
    const { animator, out, model: m } = setUp();
    animator.beginTransition(0, 1);
    animator.step(TRANSITION_SECONDS * 0.3);
    const s = easeInOutCubic(0.3);
    const from = m.frames[0]!.coords;
    const to = m.frames[1]!.coords;
    for (let i = 0; i < out.length; i++) {
      expect(out[i], `component ${i}`).toBeCloseTo(from[i]! + s * (to[i]! - from[i]!), 5);
    }
  });

  it("restarts cleanly when a new transition interrupts one in progress", () => {
    const { animator, out, model: m } = setUp();
    animator.beginTransition(0, 1);
    animator.step(TRANSITION_SECONDS * 0.4);
    animator.beginTransition(1, 2);
    // The new transition starts from frame 1's geometry, not from where the last one had reached.
    expectMatchesFrame(out, m, 1);
    animator.step(TRANSITION_SECONDS);
    expectMatchesFrame(out, m, 2);
  });

  it("runs backwards as well as forwards", () => {
    const { animator, out, model: m } = setUp();
    animator.jumpTo(2);
    animator.beginTransition(2, 1);
    animator.step(TRANSITION_SECONDS);
    expectMatchesFrame(out, m, 1);
  });

  it("shrinks faces mid-transition, which is the flaw this prototype is meant to expose", () => {
    // Book fold: at the halfway point the moving half has collapsed towards the crease, so its
    // edges are far shorter than at rest.
    const m = model("book-fold");
    const animator = new LerpAnimator();
    animator.init(m, new Float32Array(m.vertexCount * 3));
    animator.beginTransition(0, 1);
    animator.step(TRANSITION_SECONDS / 2);
    const [a, b] = m.edgesVertices[1]!; // bottom edge of the moving half
    const rest = Math.hypot(
      m.frames[0]!.coords[3 * a]! - m.frames[0]!.coords[3 * b]!,
      m.frames[0]!.coords[3 * a + 1]! - m.frames[0]!.coords[3 * b + 1]!,
    );
    const now = Math.hypot(
      animator.positions[3 * a]! - animator.positions[3 * b]!,
      animator.positions[3 * a + 1]! - animator.positions[3 * b + 1]!,
    );
    expect(now).toBeLessThan(rest * 0.6);
  });

  it("frees its frames on dispose", () => {
    const { animator, out } = setUp();
    animator.dispose();
    animator.jumpTo(1);
    expect(Array.from(out).every((v) => v === 0)).toBe(true);
  });
});
