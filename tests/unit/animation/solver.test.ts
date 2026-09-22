import { describe, expect, it } from "vitest";
import { buildSolverModel, frameTargets, measureAngles, normalise } from "@/animation/solver/model";
import { Solver } from "@/animation/solver/solver";
import { loadFold, type ResolvedModel } from "@/fold";
import { readFixture } from "../../helpers/fixtures";

function load(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error("fixture should load");
  return result.model;
}

function setUp(name: string) {
  const model = load(name);
  const solverModel = buildSolverModel(model);
  const solver = new Solver(solverModel);
  const frameCoords = (frame: number) =>
    normalise(model.frames[frame]!.coords, solverModel.scale, solverModel.offset);
  return { model, solverModel, solver, frameCoords };
}

/** Runs to a settled state, or until the budget runs out. Returns the substeps used. */
function relax(solver: Solver, budget = 20000, tolerance = 1e-4): number {
  for (let i = 1; i <= budget; i++) {
    solver.substep();
    if (i % 100 === 0 && solver.maxAngleError() < tolerance) return i;
  }
  return budget;
}

const degrees = (radians: number) => (radians * 180) / Math.PI;

describe("buildSolverModel", () => {
  it("makes one axial spring per triangulated edge and one hinge per interior edge", () => {
    const { model, solverModel } = setUp("book-fold");
    // Two quads become four triangles: 7 model edges plus 2 diagonals.
    expect(solverModel.axial).toHaveLength(9);
    // Interior edges: the crease plus the two diagonals.
    expect(solverModel.hinges).toHaveLength(3);
    const creaseHinges = solverModel.hinges.filter((h) => h.edgeIndex === 6);
    expect(creaseHinges).toHaveLength(1);
    expect(model.edgesVertices[6]).toEqual([1, 4]);
  });

  it("marks triangulation diagonals as facet creases and makes them softer", () => {
    const { solverModel } = setUp("book-fold");
    const facets = solverModel.hinges.filter((h) => h.edgeIndex === -1);
    const creases = solverModel.hinges.filter((h) => h.edgeIndex !== -1);
    expect(facets).toHaveLength(2);
    for (const facet of facets) {
      for (const crease of creases) expect(facet.k).toBeLessThan(crease.k);
    }
  });

  it("has no hinge on a boundary edge", () => {
    const { model, solverModel } = setUp("preliminary-base");
    const boundaryEdges = model.edgesFaces
      .map((faces, e) => (faces.length === 1 ? e : -1))
      .filter((e) => e !== -1);
    expect(boundaryEdges).toHaveLength(8);
    for (const hinge of solverModel.hinges) expect(boundaryEdges).not.toContain(hinge.edgeIndex);
  });

  it("gives one corner per triangle vertex, with the rest angles of the flat sheet", () => {
    const { solverModel } = setUp("preliminary-base");
    expect(solverModel.corners).toHaveLength(8 * 3);
    const total = solverModel.corners
      .slice(0, 3)
      .reduce((sum, corner) => sum + corner.restAngle, 0);
    expect(degrees(total)).toBeCloseTo(180, 9);
  });

  it("normalises the model to a unit bounding box centred on the origin", () => {
    const { model, frameCoords } = setUp("preliminary-base");
    const all = model.frames.map((_, i) => frameCoords(i));
    const values = all.flatMap((coords) => Array.from(coords));
    expect(Math.max(...values)).toBeLessThanOrEqual(0.5 + 1e-12);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-0.5 - 1e-12);
    expect(Math.max(...values.map(Math.abs))).toBeCloseTo(0.5, 9);
  });

  it("picks a timestep below the explicit stability limit", () => {
    const { solverModel } = setUp("preliminary-base");
    let maxStiffness = 0;
    for (const k of solverModel.nodeStiffness) maxStiffness = Math.max(maxStiffness, k);
    expect(solverModel.dt).toBeGreaterThan(0);
    expect(solverModel.dt).toBeLessThan(2 / Math.sqrt(maxStiffness));
  });
});

describe("frameTargets", () => {
  it("converts each frame's fold angles to radians and holds facet creases flat", () => {
    const { model, solverModel } = setUp("book-fold-90");
    const targets = frameTargets(model, solverModel, 1);
    solverModel.hinges.forEach((hinge, i) => {
      if (hinge.edgeIndex === -1) expect(targets[i]).toBe(0);
      else expect(degrees(targets[i]!)).toBeCloseTo(90, 9);
    });
  });

  it("is all zeros for the flat crease pattern", () => {
    const { model, solverModel } = setUp("preliminary-base");
    expect(Array.from(frameTargets(model, solverModel, 0))).toEqual(
      new Array(solverModel.hinges.length).fill(0),
    );
  });
});

describe("Solver", () => {
  it("leaves the flat sheet alone when every target is its current angle", () => {
    const { solver, frameCoords, model, solverModel } = setUp("preliminary-base");
    const flat = frameCoords(0);
    solver.setPositions(flat);
    solver.targets.set(frameTargets(model, solverModel, 0));
    for (let i = 0; i < 500; i++) solver.substep();
    for (let i = 0; i < flat.length; i++) {
      expect(solver.positions[i], `component ${i}`).toBeCloseTo(flat[i]!, 9);
    }
  });

  it("folds a single crease to its target angle", () => {
    const { solver, frameCoords, model, solverModel } = setUp("book-fold-90");
    solver.setPositions(frameCoords(0));
    solver.targets.set(frameTargets(model, solverModel, 1));
    relax(solver);
    expect(degrees(solver.maxAngleError())).toBeLessThan(0.5);
  });

  it("holds edge lengths while it folds", () => {
    // This is the harshest case: the target jumps straight to 90°, so the crease springs snap the
    // sheet from rest. The peak strain is a transient of about 1.6%; the animator ramps its targets
    // instead, which keeps it well below that.
    const { solver, frameCoords, model, solverModel } = setUp("book-fold-90");
    solver.setPositions(frameCoords(0));
    solver.targets.set(frameTargets(model, solverModel, 1));
    let worst = 0;
    for (let i = 0; i < 4000; i++) {
      solver.substep();
      worst = Math.max(worst, solver.maxEdgeStrain());
    }
    expect(worst).toBeLessThan(0.02);
  });

  it("distorts less when the target is ramped than when it jumps", () => {
    const measure = (ramped: boolean) => {
      const { solver, frameCoords, model, solverModel } = setUp("book-fold-90");
      solver.setPositions(frameCoords(0));
      const final = frameTargets(model, solverModel, 1);
      let worst = 0;
      for (let i = 0; i < 4000; i++) {
        const s = ramped ? Math.min(i / 2000, 1) : 1;
        for (let h = 0; h < final.length; h++) solver.targets[h] = s * final[h]!;
        solver.substep();
        worst = Math.max(worst, solver.maxEdgeStrain());
      }
      return worst;
    };
    expect(measure(true)).toBeLessThan(measure(false) / 2);
  });

  it("reaches a configuration close to the author's geometry for a single fold", () => {
    const { solver, frameCoords, model, solverModel } = setUp("book-fold-90");
    solver.setPositions(frameCoords(0));
    solver.targets.set(frameTargets(model, solverModel, 1));
    relax(solver);
    const angles = new Float64Array(solverModel.hinges.length);
    measureAngles(solver.positions, solverModel, angles);
    const crease = solverModel.hinges.findIndex((h) => h.edgeIndex === 6);
    expect(degrees(angles[crease]!)).toBeCloseTo(90, 0);
  });

  it("collapses the preliminary base towards its partial fold", () => {
    const { solver, frameCoords, model, solverModel } = setUp("preliminary-base");
    solver.setPositions(frameCoords(0));
    solver.targets.set(frameTargets(model, solverModel, 1));
    relax(solver, 40000);
    expect(degrees(solver.maxAngleError())).toBeLessThan(2);
    expect(solver.maxEdgeStrain()).toBeLessThan(0.02);
  });

  it("stays finite and bounded over a long run", () => {
    const { solver, frameCoords, model, solverModel } = setUp("preliminary-base");
    solver.setPositions(frameCoords(0));
    solver.targets.set(frameTargets(model, solverModel, 2));
    for (let i = 0; i < 10000; i++) solver.substep();
    for (const value of solver.positions) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThan(5);
    }
    expect(solver.maxEdgeStrain()).toBeLessThan(0.05);
  });

  it("settles: velocities decay once the target is reached", () => {
    const { solver, frameCoords, model, solverModel } = setUp("book-fold-90");
    solver.setPositions(frameCoords(0));
    solver.targets.set(frameTargets(model, solverModel, 1));
    relax(solver);
    for (let i = 0; i < 2000; i++) solver.substep();
    const speed = Math.max(...Array.from(solver.velocities, Math.abs));
    expect(speed).toBeLessThan(1e-3);
  });

  it("clears velocities when repositioned", () => {
    const { solver, frameCoords, model, solverModel } = setUp("book-fold");
    solver.setPositions(frameCoords(0));
    solver.targets.set(frameTargets(model, solverModel, 1));
    for (let i = 0; i < 100; i++) solver.substep();
    expect(Math.max(...Array.from(solver.velocities, Math.abs))).toBeGreaterThan(0);
    solver.setPositions(frameCoords(0));
    expect(Math.max(...Array.from(solver.velocities, Math.abs))).toBe(0);
  });
});
