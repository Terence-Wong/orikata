import { describe, expect, it } from "vitest";
import { loadFold, type ResolvedModel } from "@/fold";
import { readFixture, VALID_FIXTURES, type ValidFixture } from "../helpers/fixtures";
import { distance, interiorAngles, planarityError, vertex, type Vec3 } from "../helpers/geometry";

// Fixture coordinates are written at full double precision, so rigid-body invariants should hold
// to roughly machine precision. 1e-8 leaves room for the accumulated rounding in the derivations.
const RIGID_TOL = 1e-8;
const ANGLE_TOL_DEG = 1e-6;

function loadValid(name: ValidFixture): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) {
    throw new Error(`${name} should be valid: ${result.errors.map((e) => e.message).join("; ")}`);
  }
  return result.model;
}

function facePoints(model: ResolvedModel, frameIndex: number, face: number): Vec3[] {
  const coords = model.frames[frameIndex]!.coords;
  return model.facesVertices[face]!.map((v) => vertex(coords, v));
}

function angle(model: ResolvedModel, frameIndex: number, edge: number): number {
  return model.frames[frameIndex]!.foldAngles[edge]!;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

describe.each(VALID_FIXTURES)("fixture %s is internally consistent", (name) => {
  const model = loadValid(name);
  const frame0 = model.frames[0]!;
  const laterFrames = model.frames.slice(1);

  it("has at least two frames and a flat frame 0", () => {
    expect(model.frames.length).toBeGreaterThanOrEqual(2);
    for (let v = 0; v < model.vertexCount; v++) {
      expect(vertex(frame0.coords, v)[2]).toBe(0);
    }
  });

  it("preserves every edge length in every frame (rigid edges)", () => {
    model.edgesVertices.forEach(([a, b], e) => {
      const rest = distance(vertex(frame0.coords, a), vertex(frame0.coords, b));
      for (const frame of laterFrames) {
        const len = distance(vertex(frame.coords, a), vertex(frame.coords, b));
        expect(
          Math.abs(len - rest) / rest,
          `edge ${e} in frame ${frame.index}: ${len} vs rest ${rest}`,
        ).toBeLessThan(RIGID_TOL);
      }
    });
  });

  it("preserves every face's interior angles in every frame (rigid faces)", () => {
    // Edge lengths alone do not catch a quad shearing into a rhombus; angles do.
    model.facesVertices.forEach((_, f) => {
      const rest = interiorAngles(facePoints(model, 0, f));
      for (const frame of laterFrames) {
        const angles = interiorAngles(facePoints(model, frame.index, f));
        angles.forEach((deg, i) => {
          expect(
            Math.abs(deg - rest[i]!),
            `face ${f} corner ${i} in frame ${frame.index}`,
          ).toBeLessThan(ANGLE_TOL_DEG);
        });
      }
    });
  });

  it("keeps every face planar in every frame", () => {
    model.facesVertices.forEach((_, f) => {
      for (const frame of model.frames) {
        expect(planarityError(facePoints(model, frame.index, f))).toBeLessThan(RIGID_TOL);
      }
    });
  });

  it("gives boundary edges no fold angle and every interior edge one", () => {
    model.edgesFaces.forEach((faces, e) => {
      for (const frame of model.frames) {
        if (faces.length === 1) {
          expect(Number.isNaN(angle(model, frame.index, e)), `edge ${e}`).toBe(true);
        } else {
          expect(Number.isFinite(angle(model, frame.index, e)), `edge ${e}`).toBe(true);
        }
      }
    });
  });

  it("has fold angles whose sign matches the M/V assignment, and flat F/U creases", () => {
    for (const frame of model.frames) {
      frame.assignments.forEach((assignment, e) => {
        const theta = angle(model, frame.index, e);
        if (Number.isNaN(theta)) return;
        const label = `edge ${e} (${assignment}) in frame ${frame.index}: ${theta}°`;
        if (assignment === "F" || assignment === "U") {
          expect(Math.abs(theta), label).toBeLessThan(ANGLE_TOL_DEG);
        } else if (Math.abs(theta) > 179) {
          // Flat-folded: the sign is taken from the assignment, so only the magnitude is checked.
          expect(Math.abs(theta), label).toBeCloseTo(180, 6);
        } else if (Math.abs(theta) > 1) {
          expect(Math.sign(theta), label).toBe(assignment === "V" ? 1 : -1);
        }
      });
    }
  });

  it("has no newly-active edges at frame 0", () => {
    expect(frame0.newlyActive).toEqual([]);
    expect(frame0.parentIndex).toBeNull();
  });
});

describe("book-fold", () => {
  const model = loadValid("book-fold");

  it("has the expected metadata", () => {
    expect(model.title).toBe("Book fold");
    expect(model.frames).toHaveLength(2);
    expect(model.frames[0]!.title).toBeUndefined();
    expect(model.frames[1]!.title).toBe("Fold in half");
    expect(model.frames[1]!.description).toBeUndefined();
    expect(model.frames[1]!.parentIndex).toBe(0);
  });

  it("folds edge 6 to +180° (valley) and activates only that edge", () => {
    expect(angle(model, 0, 6)).toBeCloseTo(0, 6);
    expect(angle(model, 1, 6)).toBeCloseTo(180, 6);
    expect(model.frames[1]!.newlyActive).toEqual([6]);
  });
});

describe("book-fold-90", () => {
  const model = loadValid("book-fold-90");

  it("pins the sign convention: the valley crease is at +90° in frame 1", () => {
    expect(angle(model, 1, 6)).toBeCloseTo(90, 6);
    expect(angle(model, 2, 6)).toBeCloseTo(180, 6);
  });

  it("activates the crease in both folded frames", () => {
    expect(model.frames[1]!.newlyActive).toEqual([6]);
    expect(model.frames[2]!.newlyActive).toEqual([6]);
  });

  it("carries titles and descriptions through without inheriting them", () => {
    expect(model.frames[0]!.title).toBe("Square");
    expect(model.frames[0]!.description).toBeUndefined();
    expect(model.frames[1]!.title).toBe("Fold to 90°");
    expect(model.frames[1]!.description).toBe("Lift the right edge until it stands upright.");
    expect(model.frames[2]!.title).toBe("Fold flat");
    expect(model.frames[2]!.parentIndex).toBe(1);
  });
});

describe("diagonal-twice", () => {
  const model = loadValid("diagonal-twice");

  it("resolves the inheritance chain 0 → 1 → 2", () => {
    expect(model.frames.map((f) => f.parentIndex)).toEqual([null, 0, 1]);
    expect(model.frames[2]!.assignments).toEqual(["B", "B", "B", "B", "V", "V", "M", "V"]);
  });

  it("folds the diagonal in frame 1 and the anti-diagonal in frame 2", () => {
    expect(angle(model, 1, 4)).toBeCloseTo(180, 6);
    expect(angle(model, 1, 5)).toBeCloseTo(180, 6);
    expect(angle(model, 1, 6)).toBeCloseTo(0, 6);
    expect(angle(model, 1, 7)).toBeCloseTo(0, 6);
    expect(angle(model, 2, 6)).toBeCloseTo(-180, 6);
    expect(angle(model, 2, 7)).toBeCloseTo(180, 6);
  });

  it("activates exactly the creases that move in each step", () => {
    expect(model.frames[1]!.newlyActive).toEqual([4, 5]);
    expect(model.frames[2]!.newlyActive).toEqual([6, 7]);
  });
});

describe("preliminary-base", () => {
  const model = loadValid("preliminary-base");
  const diagonals = range(8, 11);
  const midlines = range(12, 15);
  const partialDiagonalDeg = (Math.acos(7 / 9) * 180) / Math.PI;

  it("has the derived fold angles at the partial collapse (frame 1)", () => {
    for (const e of diagonals) expect(angle(model, 1, e)).toBeCloseTo(partialDiagonalDeg, 6);
    for (const e of midlines) expect(angle(model, 1, e)).toBeCloseTo(-90, 6);
  });

  it("has the corners meeting with flat midlines and 90° diagonals (frame 2)", () => {
    for (const e of diagonals) expect(angle(model, 2, e)).toBeCloseTo(90, 6);
    for (const e of midlines) expect(angle(model, 2, e)).toBeCloseTo(-180, 6);
  });

  it("flattens with two diagonals at 180° and two opened back to 0° (frame 3)", () => {
    expect(angle(model, 3, 8)).toBeCloseTo(180, 6);
    expect(angle(model, 3, 10)).toBeCloseTo(180, 6);
    expect(angle(model, 3, 9)).toBeCloseTo(0, 6);
    expect(angle(model, 3, 11)).toBeCloseTo(0, 6);
    for (const e of midlines) expect(angle(model, 3, e)).toBeCloseTo(-180, 6);
  });

  it("activates all eight creases while collapsing and only the diagonals while flattening", () => {
    expect(model.frames[1]!.newlyActive).toEqual(range(8, 15));
    expect(model.frames[2]!.newlyActive).toEqual(range(8, 15));
    expect(model.frames[3]!.newlyActive).toEqual(diagonals);
  });
});

describe("invalid fixtures", () => {
  const cases: Array<[string, string, number | undefined]> = [
    ["invalid-json", "INVALID_JSON", undefined],
    ["one-frame", "TOO_FEW_FRAMES", undefined],
    ["missing-vertices-coords", "MISSING_VERTICES_COORDS", 1],
    ["missing-edges-vertices", "MISSING_EDGES_VERTICES", 1],
    ["missing-faces-vertices", "MISSING_FACES_VERTICES", 1],
    ["vertex-count-changes", "VERTEX_COUNT_MISMATCH", 1],
    ["topology-changes", "TOPOLOGY_MISMATCH", 1],
    ["edge-lengths-change", "EDGE_LENGTH_MISMATCH", 1],
    ["bad-frame-parent", "BAD_FRAME_PARENT", 1],
    ["inherit-cycle", "INHERIT_CYCLE", 1],
  ];

  it.each(cases)("%s is rejected with %s", (name, code, frameIndex) => {
    const result = loadFold(readFixture("invalid", name));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toEqual([code]);
    const error = result.errors[0]!;
    expect(error.frameIndex).toBe(frameIndex);
    expect(error.message.length).toBeGreaterThan(10);
    if (frameIndex !== undefined) expect(error.message).toContain(`rame ${frameIndex}`);
  });

  it("names the differing array for a topology mismatch", () => {
    const result = loadFold(readFixture("invalid", "topology-changes"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain("edges_vertices");
  });
});
