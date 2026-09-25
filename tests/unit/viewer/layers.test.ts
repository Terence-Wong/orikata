import { describe, expect, it } from "vitest";
import { loadFold, type ResolvedModel } from "@/fold";
import { buildRenderModel, writeCreases, writeTriangles } from "@/viewer/renderModel";
import { readFixture, VALID_FIXTURES } from "../../helpers/fixtures";

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
    expect(render.triangleFace).toHaveLength(12);
  });

  it("records each triangle's face, so triangles of one face move together", () => {
    const render = buildRenderModel(model("book-fold"));
    expect(render.triangleFace[0]).toBe(render.triangleFace[5]);
    expect(render.triangleFace[0]).not.toBe(render.triangleFace[11]);
  });

  it("works out a frame's layers once, when first asked", () => {
    const m = model("book-fold");
    const render = buildRenderModel(m);
    expect(render.layersAt(1)).toBe(render.layersAt(1));
    // Flat, the halves share a layer; folded, they are on different ones.
    expect(render.layersAt(0)[0]).toBe(render.layersAt(0)[1]);
    expect(render.layersAt(1)[0]).not.toBe(render.layersAt(1)[1]);
  });
});

describe("writeTriangles", () => {
  function draw(m: ResolvedModel, frame: number, thickness: number) {
    const render = buildRenderModel(m);
    const source = frameAsFloat32(m, frame);
    const positions = new Float32Array(render.triangleSource.length * 3);
    const lifts = new Float32Array(render.triangleSource.length * 3);
    writeTriangles(source, render, render.layersAt(frame), thickness, positions, lifts);
    return { render, source, positions, lifts };
  }

  it.each(VALID_FIXTURES)("draws every triangle exactly where %s puts it", (name) => {
    // Faces used to be moved off the model by their layer, which opened a visible gap at every
    // crease of the Miura-ori. Only depth is lifted now, so the paper stays joined.
    const m = model(name);
    for (const frame of m.frames) {
      const { render, source, positions } = draw(m, frame.index, 0.01);
      render.triangleSource.forEach((vertex, i) => {
        for (let k = 0; k < 3; k++)
          expect(positions[3 * i + k]).toBeCloseTo(source[3 * vertex + k]!, 6);
      });
    }
  });

  it("lifts the folded-over half of a book fold one sheet above the half it covers", () => {
    const m = model("book-fold");
    const { render, lifts } = draw(m, 1, 0.01);
    // Folded flat in the xy plane: the lifts are along z, and the valley puts the moved half on top.
    const liftOf = (face: number) => lifts[3 * render.triangleFace.indexOf(face) + 2]!;
    expect(liftOf(1) - liftOf(0)).toBeCloseTo(0.01, 6);
  });

  it("gives every triangle of a face the same lift, of its layer's thickness", () => {
    const m = model("preliminary-base");
    const { render, lifts } = draw(m, 3, 0.005);
    const layers = render.layersAt(3);
    render.triangleFace.forEach((face, i) => {
      const length = Math.hypot(lifts[3 * i]!, lifts[3 * i + 1]!, lifts[3 * i + 2]!);
      expect(length).toBeCloseTo(0.005 * Math.abs(layers[face]!), 6);
    });
  });

  it("gives a degenerate triangle no lift rather than NaN", () => {
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
    const { positions, lifts } = draw(flat.model, 0, 0.01);
    expect([...positions, ...lifts].every(Number.isFinite)).toBe(true);
  });
});

describe("writeCreases", () => {
  it("draws each crease on both sides of every face it borders", () => {
    const render = buildRenderModel(model("book-fold"));
    // Crease 6 borders two faces; the six boundary edges border one each. Two sides apiece.
    expect(render.creaseEdge).toHaveLength((2 + 6) * 2);
    expect(render.creaseEdge.filter((e) => e === 6)).toHaveLength(4);
  });

  it("draws creases on the model, lifting each copy's depth just off its own face and side", () => {
    const m = model("book-fold");
    const render = buildRenderModel(m);
    const layers = render.layersAt(1);
    const thickness = 0.01;
    const source = frameAsFloat32(m, 1);
    const positions = new Float32Array(render.creaseVertices.length * 3);
    const lifts = new Float32Array(render.creaseVertices.length * 3);
    writeCreases(source, render, layers, thickness, positions, lifts);
    render.creaseEdge.forEach((_, copy) => {
      const face = render.creaseFace[copy]!;
      const side = render.creaseSide[copy]!;
      const vertex = render.creaseVertices[2 * copy]!;
      expect(positions[3 * (2 * copy)]).toBeCloseTo(source[3 * vertex]!, 6);
      const faceUp = face === 0 ? 1 : -1; // The right half is turned over.
      const lift = lifts[3 * (2 * copy) + 2]!;
      expect(lift / (thickness * faceUp)).toBeCloseTo(layers[face]! + side * 0.3, 6);
    });
  });
});
