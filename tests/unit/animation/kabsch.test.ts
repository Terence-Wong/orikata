import { describe, expect, it } from "vitest";
import { applyRotation, applyTransform, kabsch } from "@/animation/solver/kabsch";

function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function cloud(random: () => number, count: number): Float64Array {
  const coords = new Float64Array(count * 3);
  for (let i = 0; i < coords.length; i++) coords[i] = random() * 2 - 1;
  return coords;
}

function rotationAbout(axis: [number, number, number], angle: number): Float64Array {
  const length = Math.hypot(...axis);
  const [x, y, z] = axis.map((v) => v / length) as [number, number, number];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return Float64Array.from([
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ]);
}

function determinant(m: Float64Array): number {
  return (
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
    m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
    m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
  );
}

describe("kabsch", () => {
  it("recovers a known rotation and translation exactly", () => {
    const random = makeRandom(99);
    const from = cloud(random, 12);
    const to = Float64Array.from(from);
    const rotation = rotationAbout([0.3, -0.7, 0.5], 0.9);
    applyTransform({ rotation, translation: [1.5, -2, 0.25] }, to);

    const fitted = kabsch(from, to);
    const moved = Float64Array.from(from);
    applyTransform(fitted, moved);
    for (let i = 0; i < moved.length; i++) expect(moved[i]).toBeCloseTo(to[i]!, 9);
  });

  it("returns the identity for clouds that already match", () => {
    const from = cloud(makeRandom(7), 8);
    const fitted = kabsch(from, from);
    expect(Array.from(fitted.rotation)).toEqual(expect.arrayContaining([expect.any(Number)]));
    const moved = Float64Array.from(from);
    applyTransform(fitted, moved);
    for (let i = 0; i < moved.length; i++) expect(moved[i]).toBeCloseTo(from[i]!, 9);
  });

  it("finds the best fit when the shapes differ slightly", () => {
    const random = makeRandom(31);
    const from = cloud(random, 20);
    const to = Float64Array.from(from);
    applyTransform({ rotation: rotationAbout([0, 0, 1], 0.4), translation: [0, 0, 0] }, to);
    for (let i = 0; i < to.length; i++) to[i] = to[i]! + (random() - 0.5) * 0.02;

    const moved = Float64Array.from(from);
    applyTransform(kabsch(from, to), moved);
    let worst = 0;
    for (let i = 0; i < moved.length; i++) worst = Math.max(worst, Math.abs(moved[i]! - to[i]!));
    expect(worst).toBeLessThan(0.03);
  });

  it("rotates vectors without translating them", () => {
    const rotation = rotationAbout([0, 0, 1], Math.PI / 2);
    const vectors = Float64Array.from([1, 0, 0, 0, 2, 0]);
    applyRotation(rotation, vectors);
    expect(Array.from(vectors).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 1, 0, -2, 0, 0]);
  });

  it("fits a coplanar cloud, which a flat-folded model always is", () => {
    // Points in the z = 0 plane, with coincident pairs as a flat fold produces. A covariance-based
    // polar decomposition is singular here; the quaternion solution is not.
    const from = Float64Array.from([0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0]);
    const to = Float64Array.from(from);
    const rotation = rotationAbout([0, 1, 0], Math.PI / 2);
    applyTransform({ rotation, translation: [0.25, 0, -0.5] }, to);

    const moved = Float64Array.from(from);
    applyTransform(kabsch(from, to), moved);
    for (let i = 0; i < moved.length; i++) expect(moved[i]).toBeCloseTo(to[i]!, 9);
  });

  it("fits a collinear cloud without producing a reflection", () => {
    const from = Float64Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]);
    const to = Float64Array.from(from);
    applyTransform({ rotation: rotationAbout([0, 0, 1], 0.7), translation: [0, 0, 0] }, to);
    const fitted = kabsch(from, to);
    const moved = Float64Array.from(from);
    applyTransform(fitted, moved);
    for (let i = 0; i < moved.length; i++) expect(moved[i]).toBeCloseTo(to[i]!, 9);
    expect(determinant(fitted.rotation)).toBeCloseTo(1, 9);
  });

  it("falls back to no rotation for a cloud with no extent", () => {
    const flat = new Float64Array(9); // every point at the origin
    const fitted = kabsch(flat, flat);
    for (let i = 0; i < 9; i++) {
      expect(fitted.rotation[i]).toBeCloseTo([1, 0, 0, 0, 1, 0, 0, 0, 1][i]!, 12);
    }
  });

  it("handles an empty cloud", () => {
    expect(kabsch(new Float64Array(0), new Float64Array(0)).translation).toEqual([0, 0, 0]);
  });
});
