import { describe, expect, it } from "vitest";
import { buildTopology } from "@/fold/topology";
import type { ValidatedFrame } from "@/fold/types";

function frame(
  partial: Partial<ValidatedFrame> & Pick<ValidatedFrame, "edgesVertices" | "facesVertices">,
): ValidatedFrame {
  const coords =
    partial.coords ?? new Float64Array([0, 0, 0, 0.5, 0, 0, 1, 0, 0, 1, 1, 0, 0.5, 1, 0, 0, 1, 0]);
  return {
    index: 0,
    parentIndex: null,
    title: undefined,
    description: undefined,
    coords,
    assignments: partial.edgesVertices.map(() => "U" as const),
    foldAngleHints: undefined,
    ...partial,
  };
}

const bookFoldEdges: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 0],
  [1, 4],
];

function ok(f: ValidatedFrame) {
  const result = buildTopology(f);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("; "));
  return result.topology;
}

describe("buildTopology", () => {
  it("lists the faces of each edge in the file's edge order", () => {
    const topology = ok(
      frame({
        edgesVertices: bookFoldEdges,
        facesVertices: [
          [0, 1, 4, 5],
          [1, 2, 3, 4],
        ],
      }),
    );
    expect(topology.vertexCount).toBe(6);
    expect(topology.edgesFaces).toEqual([[0], [1], [1], [1], [0], [0], [0, 1]]);
    expect(topology.facesEdges).toEqual([
      [0, 6, 4, 5],
      [1, 2, 3, 6],
    ]);
  });

  it("matches face sides to edges regardless of the edge's stored direction", () => {
    const topology = ok(
      frame({
        edgesVertices: [
          [1, 0],
          [2, 1],
          [0, 2],
        ],
        facesVertices: [[0, 1, 2]],
        coords: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      }),
    );
    expect(topology.edgesFaces).toEqual([[0], [0], [0]]);
  });

  it("keeps counter-clockwise faces as written and reverses clockwise ones", () => {
    const topology = ok(
      frame({
        edgesVertices: bookFoldEdges,
        facesVertices: [
          [0, 1, 4, 5],
          [1, 4, 3, 2],
        ],
      }),
    );
    expect(topology.facesVertices[0]).toEqual([0, 1, 4, 5]);
    expect(topology.facesVertices[1]).toEqual([2, 3, 4, 1]);
    // Reversing a face reverses its edge list too.
    expect(topology.facesEdges[1]).toEqual([2, 3, 6, 1]);
  });

  it("rejects a face side that is not an edge", () => {
    const result = buildTopology(
      frame({
        edgesVertices: bookFoldEdges.slice(0, 6) as [number, number][],
        facesVertices: [
          [0, 1, 4, 5],
          [1, 2, 3, 4],
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe("FACE_EDGE_MISSING");
    expect(result.errors[0]!.message).toContain("face 0");
    expect(result.errors[0]!.frameIndex).toBe(0);
  });

  it("rejects an edge shared by more than two faces", () => {
    const result = buildTopology(
      frame({
        edgesVertices: [
          [0, 1],
          [1, 2],
          [2, 0],
          [1, 3],
          [3, 0],
          [1, 4],
          [4, 0],
        ],
        facesVertices: [
          [0, 1, 2],
          [0, 3, 1],
          [0, 1, 4],
        ],
        coords: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 1, 1, 0]),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.code).toBe("NON_MANIFOLD_EDGE");
  });
});
