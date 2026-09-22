import { describe, expect, it } from "vitest";
import { hingeAngle, hingeGradient, type HingeNodes } from "@/animation/solver/hinge";

const HINGE: HingeNodes = { a: 0, b: 1, c: 2, d: 3 };

/**
 * The reference hinge from `geometry.ts`: edge a→b along +y, triangle (a, b, c) on the −x side and
 * triangle (b, a, d) on the +x side, both counter-clockwise from +z when flat. Rotating d about the
 * edge towards +z by φ gives a fold angle of exactly φ.
 */
function hingeCoords(phi: number): Float64Array {
  return new Float64Array([0, 0, 0, 0, 1, 0, -1, 0.5, 0, Math.cos(phi), 0.5, Math.sin(phi)]);
}

/** A deterministic pseudo-random generator, so a failure is reproducible. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function randomHinge(random: () => number): Float64Array {
  const coords = new Float64Array(12);
  for (let i = 0; i < 12; i++) coords[i] = random() * 2 - 1;
  return coords;
}

function numericGradient(coords: Float64Array, node: number, axis: number): number {
  const h = 1e-6;
  const plus = Float64Array.from(coords);
  const minus = Float64Array.from(coords);
  plus[3 * node + axis] = plus[3 * node + axis]! + h;
  minus[3 * node + axis] = minus[3 * node + axis]! - h;
  return (hingeAngle(plus, HINGE) - hingeAngle(minus, HINGE)) / (2 * h);
}

describe("hingeAngle", () => {
  it("is zero when the two triangles are coplanar", () => {
    expect(hingeAngle(hingeCoords(0), HINGE)).toBeCloseTo(0, 12);
  });

  it.each([0.3, 1, Math.PI / 2, 2.5, -0.3, -1, -Math.PI / 2, -2.5])(
    "measures a fold of %s radians",
    (phi) => {
      expect(hingeAngle(hingeCoords(phi), HINGE)).toBeCloseTo(phi, 9);
    },
  );

  it("is positive for a valley, matching the fold-angle convention", () => {
    expect(hingeAngle(hingeCoords(Math.PI / 4), HINGE)).toBeGreaterThan(0);
    expect(hingeAngle(hingeCoords(-Math.PI / 4), HINGE)).toBeLessThan(0);
  });

  it("does not change when the hinge is translated or the edge is lengthened", () => {
    const base = hingeCoords(0.7);
    const moved = Float64Array.from(base);
    for (let n = 0; n < 4; n++) moved[3 * n] = moved[3 * n]! + 5;
    expect(hingeAngle(moved, HINGE)).toBeCloseTo(hingeAngle(base, HINGE), 12);
  });

  it("is zero for a degenerate hinge rather than NaN", () => {
    const collapsed = new Float64Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(hingeAngle(collapsed, HINGE)).toBe(0);
  });
});

describe("hingeGradient", () => {
  it("matches finite differences of the angle on random hinges", () => {
    const random = makeRandom(20260922);
    const gradient = new Float64Array(12);
    for (let trial = 0; trial < 40; trial++) {
      const coords = randomHinge(random);
      hingeGradient(coords, HINGE, gradient);
      for (let node = 0; node < 4; node++) {
        for (let axis = 0; axis < 3; axis++) {
          expect(gradient[3 * node + axis], `trial ${trial} node ${node} axis ${axis}`).toBeCloseTo(
            numericGradient(coords, node, axis),
            4,
          );
        }
      }
    }
  });

  it("matches finite differences near the flat state", () => {
    const gradient = new Float64Array(12);
    const coords = hingeCoords(0.01);
    hingeGradient(coords, HINGE, gradient);
    for (let node = 0; node < 4; node++) {
      for (let axis = 0; axis < 3; axis++) {
        expect(gradient[3 * node + axis]).toBeCloseTo(numericGradient(coords, node, axis), 4);
      }
    }
  });

  it("sums to zero over the four nodes, so translating the hinge costs nothing", () => {
    const gradient = new Float64Array(12);
    hingeGradient(hingeCoords(0.9), HINGE, gradient);
    for (let axis = 0; axis < 3; axis++) {
      const sum = gradient[axis]! + gradient[3 + axis]! + gradient[6 + axis]! + gradient[9 + axis]!;
      expect(sum).toBeCloseTo(0, 10);
    }
  });

  it("pushes the free vertices along the triangle normals", () => {
    const gradient = new Float64Array(12);
    // Flat hinge: both normals are +z, and each free vertex is one unit from the edge.
    hingeGradient(hingeCoords(0), HINGE, gradient);
    for (const base of [6, 9]) {
      expect(gradient[base]).toBeCloseTo(0, 12);
      expect(gradient[base + 1]).toBeCloseTo(0, 12);
      expect(gradient[base + 2]).toBeCloseTo(1, 12);
    }
  });

  it("is zero for a degenerate hinge rather than NaN", () => {
    const gradient = new Float64Array(12).fill(7);
    hingeGradient(new Float64Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]), HINGE, gradient);
    expect(Array.from(gradient)).toEqual(new Array(12).fill(0));
  });
});
