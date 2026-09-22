import { describe, expect, it } from "vitest";
import { cornerAngle, cornerGradient } from "@/animation/solver/corner";

const CORNER = { a: 0, b: 1, c: 2 } as const;

function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function numericGradient(coords: Float64Array, node: number, axis: number): number {
  const h = 1e-6;
  const plus = Float64Array.from(coords);
  const minus = Float64Array.from(coords);
  plus[3 * node + axis] = plus[3 * node + axis]! + h;
  minus[3 * node + axis] = minus[3 * node + axis]! - h;
  return (cornerAngle(plus, CORNER) - cornerAngle(minus, CORNER)) / (2 * h);
}

describe("cornerAngle", () => {
  it("measures the angle at b between the arms to a and c", () => {
    const right = new Float64Array([1, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(cornerAngle(right, CORNER)).toBeCloseTo(Math.PI / 2, 12);
    const straight = new Float64Array([1, 0, 0, 0, 0, 0, -1, 0, 0]);
    expect(cornerAngle(straight, CORNER)).toBeCloseTo(Math.PI, 12);
    const equilateral = new Float64Array([1, 0, 0, 0, 0, 0, 0.5, Math.sqrt(3) / 2, 0]);
    expect(cornerAngle(equilateral, CORNER)).toBeCloseTo(Math.PI / 3, 12);
  });

  it("does not depend on the arms' lengths", () => {
    const short = new Float64Array([1, 0, 0, 0, 0, 0, 0, 1, 0]);
    const long = new Float64Array([7, 0, 0, 0, 0, 0, 0, 3, 0]);
    expect(cornerAngle(long, CORNER)).toBeCloseTo(cornerAngle(short, CORNER), 12);
  });

  it("is zero for a degenerate corner rather than NaN", () => {
    expect(cornerAngle(new Float64Array([0, 0, 0, 0, 0, 0, 0, 1, 0]), CORNER)).toBe(0);
  });
});

describe("cornerGradient", () => {
  it("matches finite differences on random corners", () => {
    const random = makeRandom(4242);
    const gradient = new Float64Array(9);
    for (let trial = 0; trial < 40; trial++) {
      const coords = new Float64Array(9);
      for (let i = 0; i < 9; i++) coords[i] = random() * 2 - 1;
      cornerGradient(coords, CORNER, gradient);
      for (let node = 0; node < 3; node++) {
        for (let axis = 0; axis < 3; axis++) {
          expect(gradient[3 * node + axis], `trial ${trial} node ${node} axis ${axis}`).toBeCloseTo(
            numericGradient(coords, node, axis),
            4,
          );
        }
      }
    }
  });

  it("sums to zero over the three nodes", () => {
    const gradient = new Float64Array(9);
    cornerGradient(new Float64Array([1, 0.2, 0, 0, 0, 0.1, 0.3, 1, 0]), CORNER, gradient);
    for (let axis = 0; axis < 3; axis++) {
      expect(gradient[axis]! + gradient[3 + axis]! + gradient[6 + axis]!).toBeCloseTo(0, 10);
    }
  });

  it("is zero for a degenerate corner rather than NaN", () => {
    const gradient = new Float64Array(9).fill(3);
    cornerGradient(new Float64Array([0, 0, 0, 0, 0, 0, 0, 1, 0]), CORNER, gradient);
    expect(Array.from(gradient)).toEqual(new Array(9).fill(0));
  });
});
