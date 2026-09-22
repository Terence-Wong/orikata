/**
 * Interior angle of a triangle corner and its gradient. Face angle springs use these to resist
 * shearing, the one deformation three axial springs alone leave cheap.
 */

export interface CornerNodes {
  /** The corner is at `b`, between the arms to `a` and `c`. */
  a: number;
  b: number;
  c: number;
}

const EPSILON = 1e-12;

export function cornerAngle(coords: Float64Array, corner: CornerNodes): number {
  const arms = armsOf(coords, corner);
  if (arms === null) return 0;
  const { u, v, lu, lv } = arms;
  const cosine = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv);
  return Math.acos(Math.min(1, Math.max(-1, cosine)));
}

/** Writes ∂α/∂p for the three nodes into `out` (9 entries, in the order a, b, c). */
export function cornerGradient(coords: Float64Array, corner: CornerNodes, out: Float64Array): void {
  const arms = armsOf(coords, corner);
  if (arms === null) {
    out.fill(0, 0, 9);
    return;
  }
  const { u, v, lu, lv } = arms;
  const nx = u[1] * v[2] - u[2] * v[1];
  const ny = u[2] * v[0] - u[0] * v[2];
  const nz = u[0] * v[1] - u[1] * v[0];
  const ln = Math.hypot(nx, ny, nz);
  // Collinear arms have no well-defined rotation plane.
  if (ln < EPSILON) {
    out.fill(0, 0, 9);
    return;
  }
  const n: [number, number, number] = [nx / ln, ny / ln, nz / ln];

  // Each arm's endpoint moves perpendicular to that arm, in the triangle's plane.
  const ga: [number, number, number] = [
    -(n[1] * u[2] - n[2] * u[1]) / (lu * lu),
    -(n[2] * u[0] - n[0] * u[2]) / (lu * lu),
    -(n[0] * u[1] - n[1] * u[0]) / (lu * lu),
  ];
  const gc: [number, number, number] = [
    (n[1] * v[2] - n[2] * v[1]) / (lv * lv),
    (n[2] * v[0] - n[0] * v[2]) / (lv * lv),
    (n[0] * v[1] - n[1] * v[0]) / (lv * lv),
  ];

  for (let axis = 0; axis < 3; axis++) {
    out[axis] = ga[axis]!;
    out[6 + axis] = gc[axis]!;
    out[3 + axis] = -(ga[axis]! + gc[axis]!);
  }
}

function armsOf(
  coords: Float64Array,
  corner: CornerNodes,
): { u: [number, number, number]; v: [number, number, number]; lu: number; lv: number } | null {
  const a = 3 * corner.a;
  const b = 3 * corner.b;
  const c = 3 * corner.c;
  const u: [number, number, number] = [
    coords[a]! - coords[b]!,
    coords[a + 1]! - coords[b + 1]!,
    coords[a + 2]! - coords[b + 2]!,
  ];
  const v: [number, number, number] = [
    coords[c]! - coords[b]!,
    coords[c + 1]! - coords[b + 1]!,
    coords[c + 2]! - coords[b + 2]!,
  ];
  const lu = Math.hypot(...u);
  const lv = Math.hypot(...v);
  if (lu < EPSILON || lv < EPSILON) return null;
  return { u, v, lu, lv };
}
