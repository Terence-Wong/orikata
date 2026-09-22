// Small, independent vector helpers for asserting on fixture geometry. Deliberately not imported
// from src/ so the tests do not trust the code under test.

export type Vec3 = readonly [number, number, number];

export function vertex(coords: Float64Array, i: number): Vec3 {
  return [coords[3 * i]!, coords[3 * i + 1]!, coords[3 * i + 2]!];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/** Interior angle at vertex b of the corner a-b-c, in degrees. */
export function cornerAngle(a: Vec3, b: Vec3, c: Vec3): number {
  const u = sub(a, b);
  const v = sub(c, b);
  const cosine = dot(u, v) / (length(u) * length(v));
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

/** Interior angles of a polygon, one per vertex, in vertex order. */
export function interiorAngles(points: Vec3[]): number[] {
  const n = points.length;
  return points.map((p, i) => cornerAngle(points[(i + n - 1) % n]!, p, points[(i + 1) % n]!));
}

/**
 * Maximum distance of any polygon vertex from the plane through its first three non-collinear
 * points. Zero for planar faces; triangles are trivially planar.
 */
export function planarityError(points: Vec3[]): number {
  if (points.length <= 3) return 0;
  const [p0, p1, p2] = points as [Vec3, Vec3, Vec3, ...Vec3[]];
  const n = cross(sub(p1, p0), sub(p2, p0));
  const len = length(n);
  if (len === 0) return 0;
  const unit: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
  return Math.max(...points.map((p) => Math.abs(dot(sub(p, p0), unit))));
}
