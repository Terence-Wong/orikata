import { describe, expect, it } from "vitest";
import { loadFold, type ResolvedModel } from "@/fold";
import { faceLayers } from "@/viewer/layers";
import { readFixture, VALID_FIXTURES } from "../../helpers/fixtures";
import { cross, dot, sub, vertex, type Vec3 } from "../../helpers/geometry";

function model(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error("fixture should load");
  return result.model;
}

function normal(m: ResolvedModel, frame: number, face: number): Vec3 {
  const coords = m.frames[frame]!.coords;
  const [a, b, c] = m.facesVertices[face]!.map((v) => vertex(coords, v));
  const n = cross(sub(b!, a!), sub(c!, a!));
  const length = Math.hypot(...n);
  return [n[0] / length, n[1] / length, n[2] / length];
}

/** Where a face ends up along a direction, in layers, once lifted along its own normal. */
function height(m: ResolvedModel, frame: number, face: number, layers: Int32Array, along: Vec3) {
  return layers[face]! * dot(normal(m, frame, face), along);
}

describe("faceLayers", () => {
  it("puts the whole flat sheet on one layer", () => {
    const m = model("preliminary-base");
    expect(Array.from(faceLayers(m, 0))).toEqual(new Array(m.facesVertices.length).fill(0));
  });

  it("stacks the half folded over by a valley on the front of the half it covers", () => {
    const m = model("book-fold");
    const layers = faceLayers(m, 1);
    const up = normal(m, 1, 0);
    // A valley brings the top sides together, so the moving half lies on the left half's top side.
    expect(height(m, 1, 1, layers, up) - height(m, 1, 0, layers, up)).toBe(1);
  });

  it("keeps faces joined by an open crease on the same layer", () => {
    // Preliminary base, flattened: diagonals 9 and 11 lie open across the front and back.
    const m = model("preliminary-base");
    const layers = faceLayers(m, 3);
    for (const e of [9, 11]) {
      const [f1, f2] = m.edgesFaces[e]!;
      expect(layers[f1!], `edge ${e}`).toBe(layers[f2!]);
    }
  });

  it("gives the four layers of each side of the preliminary base four different heights", () => {
    const m = model("preliminary-base");
    const layers = faceLayers(m, 3);
    const coords = m.frames[3]!.coords;
    const up = normal(m, 3, 0);
    // Faces whose centroids are on the same side (x > 0 or x < 0) are stacked on each other.
    for (const sign of [1, -1]) {
      const stack = m.facesVertices
        .map((face, f) => ({ f, x: face.reduce((sum, v) => sum + vertex(coords, v)[0], 0) }))
        .filter(({ x }) => Math.sign(x) === sign)
        .map(({ f }) => height(m, 3, f, layers, up));
      expect(stack).toHaveLength(4);
      expect(new Set(stack).size).toBe(4);
    }
  });

  it.each(VALID_FIXTURES)("puts each side of every flat fold on the correct side in %s", (name) => {
    const m = model(name);
    for (const frame of m.frames) {
      const layers = faceLayers(m, frame.index);
      m.edgesFaces.forEach((faces, e) => {
        if (faces.length !== 2 || Math.abs(frame.foldAngles[e]!) < 179.9) return;
        const [f1, f2] = faces as [number, number];
        const along = normal(m, frame.index, f1);
        const above =
          height(m, frame.index, f2, layers, along) - height(m, frame.index, f1, layers, along);
        // A valley puts f2 on f1's front, a mountain behind it; how far depends on what is between.
        const expected = frame.assignments[e] === "V" ? 1 : -1;
        expect(Math.sign(above), `edge ${e} in frame ${frame.index}`).toBe(expected);
      });
    }
  });

  it.each(VALID_FIXTURES)("never puts two overlapping flat faces of %s on one height", (name) => {
    // Faces that overlap without sharing a crease get no order from any mountain or valley; left
    // at one height they fight for the same pixels. Every such pair must be told apart.
    expectNoTiedOverlaps(model(name), 2);
  });

  it("tells overlapping faces apart when the model is folded flat in another plane", () => {
    // The airplane stood on its edge: its flat frames then have no width along y.
    const m = model("paper-airplane");
    const upright = structuredClone(m);
    upright.frames.forEach((frame) => {
      for (let v = 0; v < m.vertexCount; v++) {
        const y = frame.coords[3 * v + 1]!;
        frame.coords[3 * v + 1] = frame.coords[3 * v + 2]!;
        frame.coords[3 * v + 2] = -y;
      }
    });
    expectNoTiedOverlaps(upright, 1);
  });

  it.each([3, 4])("keeps every flap of the dart on the front of the sheet in frame %i", (frame) => {
    // Until it is folded in half, every fold of the dart brings paper over the front. The faces
    // that have not moved are the sheet itself, so everything overlapping them must be above.
    const m = model("paper-airplane");
    const layers = faceLayers(m, frame);
    const coords = m.frames[frame]!.coords;
    const flat = m.frames[0]!.coords;
    const unmoved = (f: number) =>
      m.facesVertices[f]!.every((v) =>
        [0, 1, 2].every((k) => Math.abs(coords[3 * v + k]! - flat[3 * v + k]!) < 1e-9),
      );
    const height = (f: number) => layers[f]! * Math.sign(normal(m, frame, f)[2]);
    const sheet = m.facesVertices.map((_, f) => f).filter(unmoved);
    const flaps = m.facesVertices.map((_, f) => f).filter((f) => !unmoved(f));
    expect(sheet.length).toBeGreaterThan(0);
    expect(flaps.length).toBeGreaterThan(0);
    for (const f of flaps) {
      for (const s of sheet) {
        if (!overlapFlat(m, frame, f, s, 2)) continue;
        expect(height(f), `flap ${f} over sheet face ${s}`).toBeGreaterThan(height(s));
      }
    }
  });

  it("orders a deep stack exactly, and quickly: a thousand-pleat accordion folded flat", () => {
    const panels = 1000;
    const flat: number[][] = [];
    const folded: number[][] = [];
    for (let k = 0; k <= panels; k++) {
      flat.push([k, 0], [k, 1]);
      // Folded flat, the strip zigzags between x = 0 and x = 1.
      folded.push([k % 2, 0, 0], [k % 2, 1, 0]);
    }
    const edges: number[][] = [];
    const assignments: string[] = [];
    for (let k = 0; k <= panels; k++) {
      edges.push([2 * k, 2 * k + 1]);
      assignments.push(k === 0 || k === panels ? "B" : k % 2 ? "V" : "M");
    }
    for (let k = 0; k < panels; k++) {
      edges.push([2 * k, 2 * k + 2], [2 * k + 1, 2 * k + 3]);
      assignments.push("B", "B");
    }
    const faces = Array.from({ length: panels }, (_, k) => [
      2 * k,
      2 * k + 2,
      2 * k + 3,
      2 * k + 1,
    ]);
    const result = loadFold(
      JSON.stringify({
        vertices_coords: flat,
        edges_vertices: edges,
        edges_assignment: assignments,
        faces_vertices: faces,
        file_frames: [{ frame_parent: 0, frame_inherit: true, vertices_coords: folded }],
      }),
    );
    if (!result.ok) throw new Error(result.errors[0]!.message);
    const m = result.model;

    const started = performance.now();
    const layers = faceLayers(m, 1);
    // Under 200 ms on a laptop; the limit is loose for slow CI machines, and still far below
    // the half a minute a cubic search took.
    expect(performance.now() - started).toBeLessThan(5000);

    const heights = Array.from(layers, (layer, f) => layer * Math.sign(normal(m, 1, f)[2]));
    expect(new Set(heights).size).toBe(panels);
    // Each valley puts the next panel on the front of the one before, each mountain behind it.
    for (let k = 1; k < panels; k++) {
      const along = Math.sign(normal(m, 1, k - 1)[2]);
      const step = (heights[k]! - heights[k - 1]!) * along;
      expect(Math.sign(step), `crease ${k}`).toBe(k % 2 ? 1 : -1);
    }
  });
});

/** Checks every pair of faces lying flat across `axis` whose insides overlap sits at two heights. */
function expectNoTiedOverlaps(m: ResolvedModel, axis: 0 | 1 | 2) {
  for (const frame of m.frames) {
    const layers = faceLayers(m, frame.index);
    const up = (f: number) => Math.sign(normal(m, frame.index, f)[axis]);
    const faces = m.facesVertices.length;
    for (let a = 0; a < faces; a++) {
      for (let b = a + 1; b < faces; b++) {
        if (!overlapFlat(m, frame.index, a, b, axis)) continue;
        expect(layers[a]! * up(a), `faces ${a} and ${b} in frame ${frame.index}`).not.toBe(
          layers[b]! * up(b),
        );
      }
    }
  }
}

/**
 * Whether two faces both lie flat across `axis` and one's centroid is inside the other: a simple
 * test of overlap that is enough for the convex faces of these fixtures.
 */
function overlapFlat(m: ResolvedModel, frame: number, a: number, b: number, axis: 0 | 1 | 2) {
  const [u, w] = ([0, 1, 2] as const).filter((k) => k !== axis) as [number, number];
  const coords = m.frames[frame]!.coords;
  const points = (f: number) => m.facesVertices[f]!.map((v) => vertex(coords, v));
  const flat = (f: number) => points(f).every((p) => Math.abs(p[axis]) < 1e-9);
  const up = (f: number) => Math.sign(normal(m, frame, f)[axis]);
  // Orientation of the (u, w) plane seen from +axis.
  const handed = axis === 1 ? -1 : 1;
  const centroid = (f: number) => {
    const p = points(f);
    return [u, w].map((k) => p.reduce((sum, q) => sum + q[k]!, 0) / p.length);
  };
  const contains = (f: number, [x, y]: number[]) => {
    const p = points(f);
    return p.every((q, i) => {
      const r = p[(i + 1) % p.length]!;
      const turn = (r[u]! - q[u]!) * (y! - q[w]!) - (r[w]! - q[w]!) * (x! - q[u]!);
      return handed * up(f) * turn > 1e-6;
    });
  };
  if (!flat(a) || !flat(b)) return false;
  return contains(b, centroid(a)) || contains(a, centroid(b));
}
