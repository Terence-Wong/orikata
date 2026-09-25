import { describe, expect, it } from "vitest";
import { RigidPath } from "@/animation/rigidPath";
import { loadFold, type ResolvedModel } from "@/fold";
import { readFixture, VALID_FIXTURES } from "../../helpers/fixtures";

function load(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error(`${name} should load`);
  return result.model;
}

function sizeOf(model: ResolvedModel): number {
  const c = model.frames[0]!.coords;
  let size = 0;
  for (let i = 0; i < c.length; i += 3) {
    for (let j = i + 3; j < c.length; j += 3) {
      size = Math.max(size, Math.hypot(c[i]! - c[j]!, c[i + 1]! - c[j + 1]!));
    }
  }
  return size;
}

function worstEdgeStrain(model: ResolvedModel, coords: ArrayLike<number>): number {
  const flat = model.frames[0]!.coords;
  let worst = 0;
  for (const [a, b] of model.edgesVertices) {
    const length = (c: ArrayLike<number>) =>
      Math.hypot(
        c[3 * a]! - c[3 * b]!,
        c[3 * a + 1]! - c[3 * b + 1]!,
        c[3 * a + 2]! - c[3 * b + 2]!,
      );
    worst = Math.max(worst, Math.abs(length(coords) - length(flat)) / length(flat));
  }
  return worst;
}

describe("RigidPath", () => {
  it.each(VALID_FIXTURES)("lands exactly on every stored frame of %s", (name) => {
    const model = load(name);
    const path = new RigidPath(model);
    const out = new Float64Array(model.vertexCount * 3);
    const size = sizeOf(model);
    for (let to = 1; to < model.frames.length; to++) {
      for (const [s, frame] of [
        [0, to - 1],
        [1, to],
      ] as const) {
        path.place(to - 1, to, s, out);
        // Stored coordinates carry 12 significant digits, and a deep tree of faces (seventeen
        // turns across the Miura map) accumulates their rounding, hence 1e-7 rather than 1e-8.
        const coords = model.frames[frame]!.coords;
        for (let i = 0; i < out.length; i++) {
          expect(
            Math.abs(out[i]! - coords[i]!) / size,
            `${name} ${to - 1}→${to} at ${s}`,
          ).toBeLessThan(1e-7);
        }
      }
    }
  });

  it("finds every step of the paper airplane rigid: each is a plain fold of a stack", () => {
    const model = load("paper-airplane");
    const path = new RigidPath(model);
    for (let to = 1; to < model.frames.length; to++) {
      expect(path.isRigid(to - 1, to), `step ${to - 1}→${to}`).toBe(true);
    }
  });

  it("finds a reverse fold not rigid: real paper bends to make one", () => {
    const model = load("crane");
    const path = new RigidPath(model);
    const neck = model.frames.findIndex((frame) => frame.title === "Reverse fold the neck");
    expect(path.isRigid(neck - 1, neck)).toBe(false);
  });

  it("finds the crane's petal folds and the preliminary base's collapse nearly rigid", () => {
    // Rigid motions whose fold angles change at different rates: following the angles part-way
    // leaves the faces around a vertex a little apart, which the solver can close.
    const crane = load("crane");
    const cranePath = new RigidPath(crane);
    for (const frame of crane.frames) {
      if (!frame.title?.startsWith("Petal fold")) continue;
      expect(cranePath.isRigid(frame.index - 1, frame.index), frame.title).toBe(false);
      expect(cranePath.isNearlyRigid(frame.index - 1, frame.index), frame.title).toBe(true);
    }
    const base = load("preliminary-base");
    expect(new RigidPath(base).isNearlyRigid(0, 1)).toBe(true);
    const neck = crane.frames.findIndex((frame) => frame.title === "Reverse fold the neck");
    expect(cranePath.isNearlyRigid(neck - 1, neck)).toBe(false);
  });

  it("keeps every edge its length part-way through a rigid step", () => {
    const model = load("crane");
    const path = new RigidPath(model);
    const out = new Float64Array(model.vertexCount * 3);
    const wings = model.frames.findIndex((frame) => frame.title === "Fold the wings down");
    expect(path.isRigid(wings - 1, wings)).toBe(true);
    for (const s of [0.1, 0.37, 0.5, 0.82]) {
      path.place(wings - 1, wings, s, out);
      expect(worstEdgeStrain(model, out), `s = ${s}`).toBeLessThan(1e-9);
    }
  });

  it("holds still the faces a fold does not move", () => {
    const model = load("book-fold");
    const path = new RigidPath(model);
    const out = new Float64Array(model.vertexCount * 3);
    path.place(0, 1, 0.5, out);
    // The left half (vertices 0, 1, 4, 5) stays put; the right half is standing up.
    const flat = model.frames[0]!.coords;
    for (const v of [0, 1, 4, 5]) {
      for (let k = 0; k < 3; k++) expect(out[3 * v + k]).toBeCloseTo(flat[3 * v + k]!, 9);
    }
    expect(Math.abs(out[3 * 2 + 2]!)).toBeCloseTo(0.5, 9);
  });
});
