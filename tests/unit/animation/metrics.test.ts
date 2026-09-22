import { describe, expect, it } from "vitest";
import { measureTransition, subdivide } from "@/animation/metrics";
import { LerpAnimator } from "@/animation/lerp";
import { SolverAnimator } from "@/animation/solver/animator";
import { loadFold, type ResolvedModel } from "@/fold";
import { readFixture } from "../../helpers/fixtures";

function load(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error("fixture should load");
  return result.model;
}

describe("measureTransition", () => {
  it("reports no distortion for an animator that never leaves the stored frames", () => {
    const model = load("book-fold");
    const result = measureTransition(model, new SolverAnimator(), 0, 1);
    expect(result.samples).toBeGreaterThan(40);
    expect(result.maxEdgeStrain).toBeLessThan(0.02);
    expect(result.meanEdgeStrain).toBeLessThanOrEqual(result.maxEdgeStrain);
    expect(result.landed).toBe(true);
  });

  it("catches the shrinking faces of straight-line interpolation", () => {
    const model = load("book-fold");
    const result = measureTransition(model, new LerpAnimator(), 0, 1);
    expect(result.maxEdgeStrain).toBeGreaterThan(0.4);
    expect(result.maxAngleStrainDeg).toBeGreaterThan(10);
  });

  it("measures angle distortion as well as length, which catches shearing", () => {
    const model = load("preliminary-base");
    const lerp = measureTransition(model, new LerpAnimator(), 0, 1);
    const solver = measureTransition(model, new SolverAnimator(), 0, 1);
    expect(solver.maxAngleStrainDeg).toBeLessThan(lerp.maxAngleStrainDeg);
  });

  it("records whether the animator landed on the author's geometry", () => {
    const model = load("preliminary-base");
    for (const animator of [new LerpAnimator(), new SolverAnimator()]) {
      expect(measureTransition(model, animator, 2, 3).landed).toBe(true);
    }
  });

  it("times the work without letting it affect the sampling", () => {
    const model = load("book-fold");
    const result = measureTransition(model, new SolverAnimator(), 0, 1);
    expect(result.msPerFrame).toBeGreaterThan(0);
    expect(result.frames).toBe(result.samples);
  });
});

describe("subdivide", () => {
  it("splits every face into four and keeps the model loadable", () => {
    const model = load("preliminary-base");
    const finer = subdivide(model);
    expect(finer.facesVertices.length).toBe(model.facesVertices.length * 4);
    expect(finer.frames).toHaveLength(model.frames.length);
    expect(finer.vertexCount).toBeGreaterThan(model.vertexCount);
  });

  it("keeps the model's shape: every original vertex is still there", () => {
    const model = load("book-fold");
    const finer = subdivide(model);
    for (let v = 0; v < model.vertexCount; v++) {
      for (let k = 0; k < 3; k++) {
        expect(finer.frames[1]!.coords[3 * v + k]).toBeCloseTo(
          model.frames[1]!.coords[3 * v + k]!,
          9,
        );
      }
    }
  });

  it("splits each crease into two halves with the same assignment and adds only flat edges", () => {
    const model = load("book-fold");
    const finer = subdivide(model);
    const count = (assignments: readonly string[], letter: string) =>
      assignments.filter((a) => a === letter).length;
    for (const letter of ["M", "V", "B"]) {
      expect(count(finer.frames[1]!.assignments, letter), letter).toBe(
        2 * count(model.frames[1]!.assignments, letter),
      );
    }
    // Everything else added inside a face is a flat crease.
    const extra = finer.frames[1]!.assignments.filter((a) => !["M", "V", "B"].includes(a));
    expect(extra.length).toBeGreaterThan(0);
    expect(extra.every((a) => a === "F")).toBe(true);
  });

  it("can be applied repeatedly", () => {
    const model = load("book-fold");
    const twice = subdivide(subdivide(model));
    expect(twice.facesVertices).toHaveLength(model.facesVertices.length * 16);
  });
});
