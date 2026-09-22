import { describe, expect, it } from "vitest";
import { loadFold, type ResolvedModel } from "@/fold";
import { buildCreasePattern, CREASE_PATTERN_SIZE } from "@/viewer/creasePattern";
import { readFixture } from "../../helpers/fixtures";

function model(name: string): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error("fixture should load");
  return result.model;
}

describe("buildCreasePattern", () => {
  it("draws one line per edge, carrying the edge id", () => {
    const m = model("preliminary-base");
    const pattern = buildCreasePattern(m, 0);
    expect(pattern.edges).toHaveLength(m.edgesVertices.length);
    expect(pattern.edges.map((edge) => edge.id)).toEqual(m.edgesVertices.map((_, index) => index));
  });

  it("uses frame 0's flat coordinates whichever frame is shown", () => {
    const m = model("book-fold-90");
    const flat = buildCreasePattern(m, 0);
    const folded = buildCreasePattern(m, 2);
    expect(folded.edges.map((e) => [e.x1, e.y1, e.x2, e.y2])).toEqual(
      flat.edges.map((e) => [e.x1, e.y1, e.x2, e.y2]),
    );
  });

  it("takes each edge's assignment from the frame being shown", () => {
    const m = model("book-fold");
    expect(buildCreasePattern(m, 0).edges[6]!.assignment).toBe("U");
    expect(buildCreasePattern(m, 1).edges[6]!.assignment).toBe("V");
  });

  it("marks the edges that are newly active in the frame being shown", () => {
    const m = model("preliminary-base");
    expect(buildCreasePattern(m, 0).edges.filter((e) => e.active)).toEqual([]);
    const flattening = buildCreasePattern(m, 3);
    expect(flattening.edges.filter((e) => e.active).map((e) => e.id)).toEqual([8, 9, 10, 11]);
  });

  it("fits the pattern inside a square viewport, centred, with a margin", () => {
    const pattern = buildCreasePattern(model("preliminary-base"), 0);
    const xs = pattern.edges.flatMap((e) => [e.x1, e.x2]);
    const ys = pattern.edges.flatMap((e) => [e.y1, e.y2]);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(CREASE_PATTERN_SIZE);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(CREASE_PATTERN_SIZE);
    // A square model fills the viewport in both directions and is centred.
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(CREASE_PATTERN_SIZE / 2, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(CREASE_PATTERN_SIZE / 2, 6);
  });

  it("keeps the aspect ratio of a model that is not square", () => {
    const text = JSON.stringify({
      vertices_coords: [
        [0, 0],
        [4, 0],
        [4, 1],
        [0, 1],
      ],
      edges_vertices: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
      edges_assignment: ["B", "B", "B", "B"],
      faces_vertices: [[0, 1, 2, 3]],
      file_frames: [
        {
          frame_parent: 0,
          frame_inherit: true,
          vertices_coords: [
            [0, 0, 0],
            [4, 0, 0],
            [4, 1, 0],
            [0, 1, 0],
          ],
        },
      ],
    });
    const result = loadFold(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pattern = buildCreasePattern(result.model, 0);
    const xs = pattern.edges.flatMap((e) => [e.x1, e.x2]);
    const ys = pattern.edges.flatMap((e) => [e.y1, e.y2]);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width / height).toBeCloseTo(4, 6);
  });

  it("flips the y axis so the pattern is not drawn upside down", () => {
    // FOLD's y points up; SVG's points down.
    const m = model("preliminary-base");
    const pattern = buildCreasePattern(m, 0);
    const top = m.edgesVertices.findIndex(([a, b]) => a === 0 && b === 6); // centre to (0, 1)
    expect(top).toBeGreaterThanOrEqual(0);
    const edge = pattern.edges[top]!;
    expect(edge.y2).toBeLessThan(edge.y1);
  });

  it("handles a degenerate pattern without dividing by zero", () => {
    const text = JSON.stringify({
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
    });
    const result = loadFold(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const edge of buildCreasePattern(result.model, 0).edges) {
      expect(Number.isFinite(edge.x1)).toBe(true);
      expect(Number.isFinite(edge.y1)).toBe(true);
    }
  });
});
