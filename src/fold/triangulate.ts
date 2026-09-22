export interface Triangulation {
  /** Triangles as vertex triples, counter-clockwise in frame 0 like the faces they came from. */
  triangles: [number, number, number][];
  /** The face each triangle belongs to, aligned with `triangles`. */
  trianglesFace: number[];
  /** Diagonals introduced by triangulation; these are creases the solver holds flat. */
  facetCreases: [number, number][];
}

/**
 * Ear-clips every face using frame 0's xy coordinates, where the model is flat. Faces are assumed
 * counter-clockwise (see `buildTopology`) and simple. Triangles inherit that winding, so face
 * normals keep pointing up.
 */
export function triangulateFaces(
  coords: Float64Array,
  faces: ReadonlyArray<readonly number[]>,
): Triangulation {
  const triangles: [number, number, number][] = [];
  const trianglesFace: number[] = [];
  const facetCreases: [number, number][] = [];
  const faceSides = new Set<string>();

  faces.forEach((face) => {
    for (let i = 0; i < face.length; i++) {
      faceSides.add(pairKey(face[i]!, face[(i + 1) % face.length]!));
    }
  });

  faces.forEach((face, f) => {
    for (const triangle of earClip(coords, face)) {
      triangles.push(triangle);
      trianglesFace.push(f);
      for (let i = 0; i < 3; i++) {
        const a = triangle[i]!;
        const b = triangle[(i + 1) % 3]!;
        const key = pairKey(a, b);
        if (!faceSides.has(key)) {
          faceSides.add(key);
          facetCreases.push([a, b]);
        }
      }
    }
  });

  return { triangles, trianglesFace, facetCreases };
}

function earClip(coords: Float64Array, face: readonly number[]): [number, number, number][] {
  if (face.length === 3) return [[face[0]!, face[1]!, face[2]!]];

  const remaining = [...face];
  const triangles: [number, number, number][] = [];
  let guard = remaining.length * remaining.length;

  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const prev = remaining[(i + remaining.length - 1) % remaining.length]!;
      const current = remaining[i]!;
      const next = remaining[(i + 1) % remaining.length]!;
      if (!isEar(coords, remaining, prev, current, next)) continue;
      triangles.push([prev, current, next]);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    // A degenerate or self-intersecting face has no ear; fan it so rendering still works.
    if (!clipped) break;
  }

  if (remaining.length === 3) {
    triangles.push([remaining[0]!, remaining[1]!, remaining[2]!]);
  } else {
    for (let i = 1; i < remaining.length - 1; i++) {
      triangles.push([remaining[0]!, remaining[i]!, remaining[i + 1]!]);
    }
  }
  return triangles;
}

function isEar(
  coords: Float64Array,
  polygon: readonly number[],
  prev: number,
  current: number,
  next: number,
): boolean {
  if (cross2(coords, prev, current, next) <= 0) return false; // reflex or collinear corner
  return !polygon.some(
    (v) =>
      v !== prev && v !== current && v !== next && pointInTriangle(coords, v, prev, current, next),
  );
}

/** z of (b − a) × (c − a) in the xy plane; positive when a→b→c turns left. */
function cross2(coords: Float64Array, a: number, b: number, c: number): number {
  const ax = coords[3 * a]!;
  const ay = coords[3 * a + 1]!;
  return (
    (coords[3 * b]! - ax) * (coords[3 * c + 1]! - ay) -
    (coords[3 * c]! - ax) * (coords[3 * b + 1]! - ay)
  );
}

function pointInTriangle(
  coords: Float64Array,
  p: number,
  a: number,
  b: number,
  c: number,
): boolean {
  const d1 = cross2(coords, a, b, p);
  const d2 = cross2(coords, b, c, p);
  const d3 = cross2(coords, c, a, p);
  return d1 >= 0 && d2 >= 0 && d3 >= 0;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}
