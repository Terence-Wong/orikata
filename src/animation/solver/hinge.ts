/**
 * Dihedral hinge mathematics for the fold-angle solver.
 *
 * A hinge is the edge (a, b) together with the two vertices opposite it: `c` in the triangle that
 * traverses the edge a→b, and `d` in the triangle that traverses it b→a. This is the same
 * convention as `src/fold/geometry.ts`, so a valley comes out positive.
 */

export interface HingeNodes {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Below this the hinge is treated as degenerate and contributes nothing. */
const EPSILON = 1e-12;

/** Fold angle of the hinge in radians, in (−π, π]. */
export function hingeAngle(coords: Float64Array, hinge: HingeNodes): number {
  const g = geometry(coords, hinge);
  return g === null ? 0 : Math.atan2(g.sine, g.cosine);
}

/**
 * Writes ∂θ/∂p for the four hinge nodes into `out` (12 entries, in the order a, b, c, d).
 *
 * The free vertices move along their own triangle's normal, scaled by their distance to the edge;
 * the edge endpoints take the remainder, split by how far along the edge each free vertex projects,
 * which keeps the gradient translation-invariant.
 */
export function hingeGradient(coords: Float64Array, hinge: HingeNodes, out: Float64Array): void {
  const g = geometry(coords, hinge);
  if (g === null) {
    out.fill(0, 0, 12);
    return;
  }
  const { n1, n2, h1, h2, coefC, coefD } = g;

  for (let axis = 0; axis < 3; axis++) {
    const gc = n1[axis]! / h1;
    const gd = n2[axis]! / h2;
    out[6 + axis] = gc;
    out[9 + axis] = gd;
    out[axis] = -(1 - coefC) * gc - (1 - coefD) * gd;
    out[3 + axis] = -coefC * gc - coefD * gd;
  }
}

interface HingeGeometry {
  n1: [number, number, number];
  n2: [number, number, number];
  h1: number;
  h2: number;
  coefC: number;
  coefD: number;
  sine: number;
  cosine: number;
}

function geometry(coords: Float64Array, hinge: HingeNodes): HingeGeometry | null {
  const a = 3 * hinge.a;
  const b = 3 * hinge.b;
  const c = 3 * hinge.c;
  const d = 3 * hinge.d;

  const ex = coords[b]! - coords[a]!;
  const ey = coords[b + 1]! - coords[a + 1]!;
  const ez = coords[b + 2]! - coords[a + 2]!;
  const edgeLengthSquared = ex * ex + ey * ey + ez * ez;
  if (edgeLengthSquared < EPSILON) return null;
  const edgeLength = Math.sqrt(edgeLengthSquared);

  const acx = coords[c]! - coords[a]!;
  const acy = coords[c + 1]! - coords[a + 1]!;
  const acz = coords[c + 2]! - coords[a + 2]!;
  const adx = coords[d]! - coords[a]!;
  const ady = coords[d + 1]! - coords[a + 1]!;
  const adz = coords[d + 2]! - coords[a + 2]!;

  // Unnormalised normals: triangle (a, b, c) is e × ac, triangle (b, a, d) is ad × e.
  const m1x = ey * acz - ez * acy;
  const m1y = ez * acx - ex * acz;
  const m1z = ex * acy - ey * acx;
  const m2x = ady * ez - adz * ey;
  const m2y = adz * ex - adx * ez;
  const m2z = adx * ey - ady * ex;

  const l1 = Math.hypot(m1x, m1y, m1z);
  const l2 = Math.hypot(m2x, m2y, m2z);
  if (l1 < EPSILON || l2 < EPSILON) return null;

  const n1: [number, number, number] = [m1x / l1, m1y / l1, m1z / l1];
  const n2: [number, number, number] = [m2x / l2, m2y / l2, m2z / l2];

  // |e × ac| / |e| is exactly the distance from the free vertex to the edge line.
  const h1 = l1 / edgeLength;
  const h2 = l2 / edgeLength;

  const ux = ex / edgeLength;
  const uy = ey / edgeLength;
  const uz = ez / edgeLength;
  const cosine = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
  const sine =
    (n2[1] * n1[2] - n2[2] * n1[1]) * ux +
    (n2[2] * n1[0] - n2[0] * n1[2]) * uy +
    (n2[0] * n1[1] - n2[1] * n1[0]) * uz;

  return {
    n1,
    n2,
    h1,
    h2,
    coefC: (acx * ex + acy * ey + acz * ez) / edgeLengthSquared,
    coefD: (adx * ex + ady * ey + adz * ez) / edgeLengthSquared,
    sine,
    cosine,
  };
}
