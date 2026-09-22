import type { Assignment, Topology } from "./types";

export type Vec3 = [number, number, number];

const RAD_TO_DEG = 180 / Math.PI;

/** Below this |sin θ| a hinge with antiparallel normals is treated as folded flat (±180°). */
const FLAT_FOLD_EPSILON = 1e-6;

/** Unit normal of a polygon by Newell's method; robust for quads that are slightly non-planar. */
export function faceNormal(coords: Float64Array, face: readonly number[]): Vec3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < face.length; i++) {
    const p = 3 * face[i]!;
    const q = 3 * face[(i + 1) % face.length]!;
    const px = coords[p]!;
    const py = coords[p + 1]!;
    const pz = coords[p + 2]!;
    const qx = coords[q]!;
    const qy = coords[q + 1]!;
    const qz = coords[q + 2]!;
    nx += (py - qy) * (pz + qz);
    ny += (pz - qz) * (px + qx);
    nz += (px - qx) * (py + qy);
  }
  const len = Math.hypot(nx, ny, nz);
  return len === 0 ? [0, 0, 0] : [nx / len, ny / len, nz / len];
}

/**
 * Signed fold angle of every edge, in degrees, valley positive (FOLD `edges_foldAngle` convention).
 * Boundary edges get NaN.
 *
 * For an interior edge (a, b) let f₁ be the face that traverses it as a→b in its winding and f₂ the
 * other face; with unit normals n₁, n₂ and û = (b − a)/|b − a|:
 *   θ = atan2((n₂ × n₁)·û, n₁·n₂)
 * At ±180° the two faces coincide and the sign is undefined, so it is taken from the assignment.
 */
export function computeFoldAngles(
  coords: Float64Array,
  topology: Topology,
  assignments: readonly Assignment[],
): Float64Array {
  const angles = new Float64Array(topology.edgesVertices.length).fill(Number.NaN);
  const normals = topology.facesVertices.map((face) => faceNormal(coords, face));

  topology.edgesVertices.forEach(([a, b], e) => {
    const faces = topology.edgesFaces[e]!;
    if (faces.length !== 2) return;
    const first = faces[0]!;
    const second = faces[1]!;
    const forwardInFirst = traversesForward(topology.facesVertices[first]!, a, b);
    const f1 = forwardInFirst ? first : second;
    const f2 = forwardInFirst ? second : first;

    const dx = coords[3 * b]! - coords[3 * a]!;
    const dy = coords[3 * b + 1]! - coords[3 * a + 1]!;
    const dz = coords[3 * b + 2]! - coords[3 * a + 2]!;
    const len = Math.hypot(dx, dy, dz);
    if (len === 0) {
      angles[e] = 0;
      return;
    }
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;

    const [n1x, n1y, n1z] = normals[f1]!;
    const [n2x, n2y, n2z] = normals[f2]!;
    // (n₂ × n₁) · û
    const sine =
      (n2y * n1z - n2z * n1y) * ux + (n2z * n1x - n2x * n1z) * uy + (n2x * n1y - n2y * n1x) * uz;
    const cosine = n1x * n2x + n1y * n2y + n1z * n2z;

    if (Math.abs(sine) < FLAT_FOLD_EPSILON && cosine < 0) {
      angles[e] = assignments[e] === "M" ? -180 : 180;
      return;
    }
    angles[e] = Math.atan2(sine, cosine) * RAD_TO_DEG;
  });

  return angles;
}

/** True when the face's winding visits `a` immediately followed by `b`. */
function traversesForward(face: readonly number[], a: number, b: number): boolean {
  for (let i = 0; i < face.length; i++) {
    if (face[i] === a && face[(i + 1) % face.length] === b) return true;
  }
  return false;
}
