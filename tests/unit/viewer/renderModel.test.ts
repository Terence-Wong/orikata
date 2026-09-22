import { describe, expect, it } from "vitest";
import { loadFold, type ResolvedModel } from "@/fold";
import { buildRenderModel, CREASE_COLORS, fitCamera } from "@/viewer/renderModel";
import { readFixture } from "../../helpers/fixtures";

function model(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error("fixture should load");
  return result.model;
}

describe("buildRenderModel", () => {
  it("emits three indices per triangle for every face", () => {
    const render = buildRenderModel(model("book-fold"));
    // Two quads become four triangles.
    expect(render.triangles).toBeInstanceOf(Uint32Array);
    expect(render.triangles).toHaveLength(12);
  });

  it("emits two indices per edge, in the model's edge order", () => {
    const m = model("book-fold");
    const render = buildRenderModel(m);
    expect(render.lines).toHaveLength(m.edgesVertices.length * 2);
    m.edgesVertices.forEach(([a, b], e) => {
      expect([render.lines[2 * e], render.lines[2 * e + 1]]).toEqual([a, b]);
    });
  });

  it("keeps facet creases out of the drawn edges", () => {
    const render = buildRenderModel(model("book-fold"));
    expect(render.facetCreases.length).toBeGreaterThan(0);
    for (const [a, b] of render.facetCreases) {
      const drawn = model("book-fold").edgesVertices.some(
        ([x, y]) => (x === a && y === b) || (x === b && y === a),
      );
      expect(drawn).toBe(false);
    }
  });

  it("gives mountain red, valley blue and leaves other creases neutral", () => {
    expect(CREASE_COLORS.M).toBe(0xd2262c);
    expect(CREASE_COLORS.V).toBe(0x1f5fd0);
    expect(CREASE_COLORS.M).not.toBe(CREASE_COLORS.U);
    expect(CREASE_COLORS.V).not.toBe(CREASE_COLORS.U);
    expect(CREASE_COLORS.F).toBe(CREASE_COLORS.U);
  });
});

describe("fitCamera", () => {
  it("centres on the model and keeps every frame inside the view", () => {
    const fit = fitCamera(model("preliminary-base"), 50, 1);
    expect(fit.center[0]).toBeCloseTo(0, 6);
    expect(fit.center[1]).toBeCloseTo(0, 6);
    // Frames span z from 0 down to −√2, so the centre sits below the flat sheet.
    expect(fit.center[2]).toBeCloseTo(-Math.SQRT2 / 2, 6);
    expect(fit.radius).toBeGreaterThan(Math.SQRT2);
    expect(fit.distance).toBeGreaterThan(fit.radius);
  });

  it("moves the camera further away for a narrow viewport", () => {
    const wide = fitCamera(model("book-fold"), 50, 2);
    const narrow = fitCamera(model("book-fold"), 50, 0.5);
    expect(narrow.distance).toBeGreaterThan(wide.distance);
  });

  it("moves the camera further away for a narrower field of view", () => {
    const near = fitCamera(model("book-fold"), 60, 1);
    const far = fitCamera(model("book-fold"), 20, 1);
    expect(far.distance).toBeGreaterThan(near.distance);
  });

  it("never returns a zero radius, so a degenerate model still renders", () => {
    const flat = loadFold(
      JSON.stringify({
        vertices_coords: [
          [0, 0],
          [0, 0],
          [0, 0],
        ],
        edges_vertices: [
          [0, 1],
          [1, 2],
          [2, 0],
        ],
        faces_vertices: [[0, 1, 2]],
        file_frames: [
          {
            frame_parent: 0,
            frame_inherit: true,
            vertices_coords: [
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ],
          },
        ],
      }),
    );
    expect(flat.ok).toBe(true);
    if (!flat.ok) return;
    const fit = fitCamera(flat.model, 50, 1);
    expect(fit.radius).toBeGreaterThan(0);
    expect(Number.isFinite(fit.distance)).toBe(true);
  });
});
