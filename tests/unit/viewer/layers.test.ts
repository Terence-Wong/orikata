import { describe, expect, it } from "vitest";
import { loadFold, type ResolvedModel } from "@/fold";
import { buildRenderModel, writeTrianglePositions } from "@/viewer/renderModel";
import { readFixture } from "../../helpers/fixtures";

function model(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error("fixture should load");
  return result.model;
}

function frameAsFloat32(m: ResolvedModel, frame: number): Float32Array {
  return Float32Array.from(m.frames[frame]!.coords);
}

describe("buildRenderModel triangle layers", () => {
  it("gives every triangle its own vertices, so faces can be separated", () => {
    const m = model("book-fold");
    const render = buildRenderModel(m);
    // Two quads become four triangles, each with three vertices of its own.
    expect(render.triangleSource).toHaveLength(12);
    expect(render.triangleLayer).toHaveLength(12);
  });

  it("numbers the layers by face, so triangles of one face stay together", () => {
    const m = model("book-fold");
    const render = buildRenderModel(m);
    // The first quad's two triangles share a layer; the second quad's differ from them.
    expect(render.triangleLayer[0]).toBe(render.triangleLayer[5]);
    expect(render.triangleLayer[0]).not.toBe(render.triangleLayer[11]);
  });
});

describe("writeTrianglePositions", () => {
  it("reproduces the model exactly when the paper has no thickness", () => {
    const m = model("book-fold");
    const render = buildRenderModel(m);
    const source = frameAsFloat32(m, 0);
    const out = new Float32Array(render.triangleSource.length * 3);
    writeTrianglePositions(source, render, 0, out);
    render.triangleSource.forEach((vertex, i) => {
      for (let k = 0; k < 3; k++) {
        expect(out[3 * i + k]).toBeCloseTo(source[3 * vertex + k]!, 6);
      }
    });
  });

  it("separates layers that would otherwise sit in the same plane", () => {
    // Book fold, folded flat: the right half lies exactly on the left half.
    const m = model("book-fold");
    const render = buildRenderModel(m);
    const source = frameAsFloat32(m, 1);
    const out = new Float32Array(render.triangleSource.length * 3);
    const thickness = 0.01;
    writeTrianglePositions(source, render, thickness, out);

    // Vertex 1 sits on the crease and belongs to both halves; its two copies must now differ.
    const copies: number[][] = [];
    render.triangleSource.forEach((vertex, i) => {
      if (vertex === 1) copies.push([out[3 * i]!, out[3 * i + 1]!, out[3 * i + 2]!]);
    });
    expect(copies.length).toBeGreaterThan(1);
    const spread = Math.max(...copies.map((p) => p[2]!)) - Math.min(...copies.map((p) => p[2]!));
    expect(spread).toBeGreaterThan(thickness / 2);
  });

  it("moves nothing further than the thickness it was given", () => {
    const m = model("preliminary-base");
    const render = buildRenderModel(m);
    const source = frameAsFloat32(m, 2);
    const out = new Float32Array(render.triangleSource.length * 3);
    const thickness = 0.005;
    writeTrianglePositions(source, render, thickness, out);
    const layers = Math.max(...render.triangleLayer) + 1;
    render.triangleSource.forEach((vertex, i) => {
      const moved = Math.hypot(
        out[3 * i]! - source[3 * vertex]!,
        out[3 * i + 1]! - source[3 * vertex + 1]!,
        out[3 * i + 2]! - source[3 * vertex + 2]!,
      );
      expect(moved).toBeLessThanOrEqual(thickness * layers + 1e-6);
    });
  });

  it("leaves a degenerate triangle where it is rather than producing NaN", () => {
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
    const render = buildRenderModel(flat.model);
    const out = new Float32Array(render.triangleSource.length * 3);
    writeTrianglePositions(frameAsFloat32(flat.model, 0), render, 0.01, out);
    expect(Array.from(out).every(Number.isFinite)).toBe(true);
  });
});
