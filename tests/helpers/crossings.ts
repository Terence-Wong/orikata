import type { ResolvedModel } from "@/fold";
import { triangulateFaces } from "@/fold/triangulate";

type Vec = [number, number, number];

/**
 * Measures paper passing through paper: the deepest point where an edge of one triangle crosses
 * the inside of another face's triangle, as a fraction of the model's size. Layers lying flat on
 * each other are coplanar and do not count, nor does an edge only touching another face.
 */
export function deepestCrossing(model: ResolvedModel): (coords: ArrayLike<number>) => number {
  const { triangles, trianglesFace } = triangulateFaces(
    model.frames[0]!.coords,
    model.facesVertices,
  );
  const flat = model.frames[0]!.coords;
  let size = 0;
  for (let i = 0; i < flat.length; i += 3) {
    for (let j = i + 3; j < flat.length; j += 3) {
      size = Math.max(size, Math.hypot(flat[i]! - flat[j]!, flat[i + 1]! - flat[j + 1]!));
    }
  }
  const margin = 1e-6 * size;

  const pierce = (p: Vec, q: Vec, a: Vec, b: Vec, c: Vec): number => {
    const n = cross(sub(b, a), sub(c, a));
    const length = Math.hypot(...n);
    if (length === 0) return 0;
    const dp = dot(sub(p, a), n) / length;
    const dq = dot(sub(q, a), n) / length;
    if ((dp > -margin && dq > -margin) || (dp < margin && dq < margin)) return 0;
    const t = dp / (dp - dq);
    const x: Vec = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])];
    for (const [u, w] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const inside = dot(cross(sub(w, u), sub(x, u)), n) / length / Math.hypot(...sub(w, u));
      if (inside < 10 * margin) return 0;
    }
    return Math.min(Math.abs(dp), Math.abs(dq));
  };

  return (coords) => {
    const at = (v: number): Vec => [coords[3 * v]!, coords[3 * v + 1]!, coords[3 * v + 2]!];
    let deepest = 0;
    for (let i = 0; i < triangles.length; i++) {
      const ti = triangles[i]!.map(at) as [Vec, Vec, Vec];
      for (let j = i + 1; j < triangles.length; j++) {
        if (trianglesFace[i] === trianglesFace[j]) continue;
        const tj = triangles[j]!.map(at) as [Vec, Vec, Vec];
        for (let k = 0; k < 3; k++) {
          deepest = Math.max(
            deepest,
            pierce(ti[k]!, ti[(k + 1) % 3]!, ...tj),
            pierce(tj[k]!, tj[(k + 1) % 3]!, ...ti),
          );
        }
      }
    }
    return deepest / size;
  };
}

function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
