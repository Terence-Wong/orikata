import { describe, expect, it } from "vitest";
import { TRANSITION_SECONDS } from "@/animation/types";
import { Follow } from "@/viewer/follow";

const FRAME = 1 / 60;

/** Steps a follower towards `target` until it stops, recording where it was after each frame. */
function run(follow: Follow, target: readonly number[], dt = FRAME): number[][] {
  const path: number[][] = [];
  for (let i = 0; i < 1000 && follow.step(target, dt); i++) path.push([...follow.value]);
  return path;
}

describe("Follow", () => {
  it("starts where it is put and stays there while the target does", () => {
    const follow = new Follow([1, 2, 3], 1);
    expect(follow.step([1, 2, 3], FRAME)).toBe(false);
    expect([...follow.value]).toEqual([1, 2, 3]);
  });

  it("arrives at a new target about as a step finishes playing, and stops exactly on it", () => {
    const follow = new Follow([0, 0, 0], 1);
    const target = [0.4, -0.3, 0.1];
    const path = run(follow, target);
    expect([...follow.value]).toEqual(target);
    const seconds = path.length * FRAME;
    expect(seconds).toBeGreaterThan(TRANSITION_SECONDS);
    expect(seconds).toBeLessThan(TRANSITION_SECONDS * 2);
    // By the time the step has played it is nearly there; the rest is too small to notice.
    const atEnd = path[Math.round(TRANSITION_SECONDS / FRAME)]!;
    expect(Math.hypot(...atEnd.map((v, k) => v - target[k]!))).toBeLessThan(0.02 * 0.5);
  });

  it("never overshoots", () => {
    const follow = new Follow([0, 0, 0], 1);
    for (const [x] of run(follow, [1, 0, 0])) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });

  it("eases in and out rather than jumping off the mark", () => {
    const follow = new Follow([0, 0, 0], 1);
    const xs = [0, ...run(follow, [1, 0, 0]).map(([x]) => x!)];
    const speeds = xs.slice(1).map((x, i) => x - xs[i]!);
    const fastest = Math.max(...speeds);
    expect(speeds[0]!).toBeLessThan(fastest * 0.2);
    expect(speeds.at(-2)!).toBeLessThan(fastest * 0.2);
  });

  it("takes the same path whatever the frame rate", () => {
    const slow = new Follow([0, 0, 0], 1);
    const fast = new Follow([0, 0, 0], 1);
    for (let i = 0; i < 12; i++) slow.step([1, 1, 0], 1 / 30);
    for (let i = 0; i < 48; i++) fast.step([1, 1, 0], 1 / 120);
    for (let k = 0; k < 3; k++) expect(slow.value[k]).toBeCloseTo(fast.value[k]!, 9);
  });

  it("carries on smoothly when the target changes on the way", () => {
    const follow = new Follow([0, 0, 0], 1);
    for (let i = 0; i < 20; i++) follow.step([1, 0, 0], FRAME);
    const before = follow.value[0]!;
    follow.step([-1, 0, 0], FRAME);
    // Still moving the way it was going for a moment, not reversing on the spot.
    expect(follow.value[0]!).toBeGreaterThan(before);
  });
});
