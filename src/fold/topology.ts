import type { FoldError, Topology, ValidatedFrame } from "./types";

export type TopologyResult = { ok: true; topology: Topology } | { ok: false; errors: FoldError[] };

/**
 * Derives the connectivity shared by all frames from frame 0. Faces are re-wound to be
 * counter-clockwise when viewed from +z (using their signed area in frame 0) so that every face
 * normal starts pointing up and the fold-angle sign convention is well defined. Edge ids keep the
 * file's order so they stay aligned with `edges_assignment`.
 */
export function buildTopology(frame0: ValidatedFrame): TopologyResult {
  const vertexCount = frame0.coords.length / 3;
  const edgesVertices = frame0.edgesVertices.map(([a, b]) => [a, b] as const);
  const facesVertices = frame0.facesVertices.map((face) =>
    signedAreaXY(frame0.coords, face) < 0 ? [...face].reverse() : [...face],
  );

  const edgeByPair = new Map<string, number>();
  edgesVertices.forEach(([a, b], e) => edgeByPair.set(pairKey(a, b), e));

  const edgesFaces: number[][] = edgesVertices.map(() => []);
  const facesEdges: number[][] = [];
  for (let f = 0; f < facesVertices.length; f++) {
    const face = facesVertices[f]!;
    const edges: number[] = [];
    for (let i = 0; i < face.length; i++) {
      const a = face[i]!;
      const b = face[(i + 1) % face.length]!;
      const e = edgeByPair.get(pairKey(a, b));
      if (e === undefined) {
        return fail(
          "FACE_EDGE_MISSING",
          `face ${f} has a side from vertex ${a} to vertex ${b} that is not listed in edges_vertices.`,
        );
      }
      edges.push(e);
      const adjacent = edgesFaces[e]!;
      adjacent.push(f);
      if (adjacent.length > 2) {
        return fail(
          "NON_MANIFOLD_EDGE",
          `edge ${e} (vertices ${a}–${b}) is shared by more than two faces (${adjacent.join(", ")}). Paper edges can join at most two faces.`,
        );
      }
    }
    facesEdges.push(edges);
  }

  return {
    ok: true,
    topology: { vertexCount, edgesVertices, facesVertices, edgesFaces, facesEdges },
  };
}

function fail(code: FoldError["code"], message: string): TopologyResult {
  return { ok: false, errors: [{ code, frameIndex: 0, message: `Frame 0: ${message}` }] };
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

/** Shoelace area of the face's projection onto the xy plane; positive for counter-clockwise. */
function signedAreaXY(coords: Float64Array, face: readonly number[]): number {
  let area = 0;
  for (let i = 0; i < face.length; i++) {
    const p = face[i]!;
    const q = face[(i + 1) % face.length]!;
    area += coords[3 * p]! * coords[3 * q + 1]! - coords[3 * q]! * coords[3 * p + 1]!;
  }
  return area / 2;
}
