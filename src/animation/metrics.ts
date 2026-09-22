import { loadFold, type Assignment, type ResolvedModel } from "@/fold";
import type { FoldAnimator } from "./types";

/** Every measurement is taken at a fixed 60 fps so the two animators see identical timing. */
export const SAMPLE_DT = 1 / 60;
const MAX_FRAMES = 600;
const LANDED_TOLERANCE = 1e-4;

export interface TransitionMetrics {
  from: number;
  to: number;
  frames: number;
  samples: number;
  /** Worst relative change in any model edge's length during the transition. */
  maxEdgeStrain: number;
  /** Mean relative change, over every edge at every sample. */
  meanEdgeStrain: number;
  /** Worst change in any face's interior angle, in degrees: this is what catches shearing. */
  maxAngleStrainDeg: number;
  meanAngleStrainDeg: number;
  /** Whether the animator finished exactly on the destination frame's stored geometry. */
  landed: boolean;
  /** Mean wall-clock time spent inside `step`, in milliseconds. */
  msPerFrame: number;
}

/**
 * Runs one transition end to end and measures how far the paper is stretched and sheared on the
 * way. Rest lengths and rest angles come from frame 0, where the sheet is flat.
 */
export function measureTransition(
  model: ResolvedModel,
  animator: FoldAnimator,
  from: number,
  to: number,
): TransitionMetrics {
  const positions = new Float32Array(model.vertexCount * 3);
  animator.init(model, positions);
  animator.jumpTo(from);

  const flat = model.frames[0]!.coords;
  const restLengths = model.edgesVertices.map(([a, b]) => distance(flat, a, b));
  const restAngles = model.facesVertices.map((face) => interiorAngles(flat, face));

  let maxEdgeStrain = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  let maxAngleStrain = 0;
  let angleTotal = 0;
  let angleCount = 0;
  let samples = 0;
  let elapsedMs = 0;

  animator.beginTransition(from, to);
  let frames = 0;
  for (let i = 0; i < MAX_FRAMES; i++) {
    const started = performance.now();
    const state = animator.step(SAMPLE_DT);
    elapsedMs += performance.now() - started;
    frames += 1;

    model.edgesVertices.forEach(([a, b], e) => {
      const rest = restLengths[e]!;
      if (rest === 0) return;
      const strain = Math.abs(distance(positions, a, b) - rest) / rest;
      maxEdgeStrain = Math.max(maxEdgeStrain, strain);
      edgeTotal += strain;
      edgeCount += 1;
    });
    model.facesVertices.forEach((face, f) => {
      const rest = restAngles[f]!;
      interiorAngles(positions, face).forEach((angle, corner) => {
        const strain = Math.abs(angle - rest[corner]!);
        maxAngleStrain = Math.max(maxAngleStrain, strain);
        angleTotal += strain;
        angleCount += 1;
      });
    });
    samples += 1;

    if (state === "idle") break;
  }

  const target = model.frames[to]!.coords;
  let landingError = 0;
  for (let i = 0; i < positions.length; i++) {
    landingError = Math.max(landingError, Math.abs(positions[i]! - target[i]!));
  }
  animator.dispose();

  return {
    from,
    to,
    frames,
    samples,
    maxEdgeStrain,
    meanEdgeStrain: edgeCount === 0 ? 0 : edgeTotal / edgeCount,
    maxAngleStrainDeg: maxAngleStrain,
    meanAngleStrainDeg: angleCount === 0 ? 0 : angleTotal / angleCount,
    landed: landingError < LANDED_TOLERANCE,
    msPerFrame: frames === 0 ? 0 : elapsedMs / frames,
  };
}

/**
 * Splits every face into four, keeping the surface exactly where it was: triangles gain their edge
 * midpoints, quads gain those plus a centre point. New edges are unassigned creases, so the model
 * folds the same way with several times the vertices. Used to see how each prototype scales.
 */
export function subdivide(model: ResolvedModel): ResolvedModel {
  const frameCount = model.frames.length;
  const coords: number[][][] = model.frames.map((frame) => {
    const list: number[][] = [];
    for (let v = 0; v < model.vertexCount; v++) {
      list.push([frame.coords[3 * v]!, frame.coords[3 * v + 1]!, frame.coords[3 * v + 2]!]);
    }
    return list;
  });

  const midpointCache = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const existing = midpointCache.get(key);
    if (existing !== undefined) return existing;
    const index = coords[0]!.length;
    for (let f = 0; f < frameCount; f++) {
      const p = coords[f]![a]!;
      const q = coords[f]![b]!;
      coords[f]!.push([(p[0]! + q[0]!) / 2, (p[1]! + q[1]!) / 2, (p[2]! + q[2]!) / 2]);
    }
    midpointCache.set(key, index);
    return index;
  };
  const centroid = (face: readonly number[]): number => {
    const index = coords[0]!.length;
    for (let f = 0; f < frameCount; f++) {
      const points = face.map((v) => coords[f]![v]!);
      coords[f]!.push([0, 1, 2].map((k) => points.reduce((s, p) => s + p[k]!, 0) / points.length));
    }
    return index;
  };

  const edges: [number, number][] = [];
  const edgeAssignments: Assignment[][] = model.frames.map(() => []);
  const edgeIndexByKey = new Map<string, number>();
  const addEdge = (a: number, b: number, source: number | null) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (edgeIndexByKey.has(key)) return;
    edgeIndexByKey.set(key, edges.length);
    edges.push([a, b]);
    model.frames.forEach((frame, f) => {
      // Halves of an original edge keep its assignment; edges inside a face are flat creases.
      edgeAssignments[f]!.push(source === null ? "F" : frame.assignments[source]!);
    });
  };

  const sourceEdgeOf = new Map<string, number>();
  model.edgesVertices.forEach(([a, b], e) =>
    sourceEdgeOf.set(a < b ? `${a},${b}` : `${b},${a}`, e),
  );
  const sourceOf = (a: number, b: number): number | null =>
    sourceEdgeOf.get(a < b ? `${a},${b}` : `${b},${a}`) ?? null;

  const faces: number[][] = [];
  for (const face of model.facesVertices) {
    const mids = face.map((v, i) => midpoint(v, face[(i + 1) % face.length]!));
    if (face.length === 3) {
      const [a, b, c] = face as unknown as [number, number, number];
      const [ab, bc, ca] = mids as [number, number, number];
      faces.push([a, ab, ca], [ab, b, bc], [bc, c, ca], [ab, bc, ca]);
    } else {
      const centre = centroid(face);
      for (let i = 0; i < face.length; i++) {
        faces.push([face[i]!, mids[i]!, centre, mids[(i + face.length - 1) % face.length]!]);
      }
    }
  }

  // Every side of every new face has to exist as an edge, with the right assignment.
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i]!;
      const b = face[(i + 1) % face.length]!;
      const originalA = a < model.vertexCount ? a : null;
      const originalB = b < model.vertexCount ? b : null;
      let source: number | null = null;
      if (originalA !== null && originalB === null) source = sourceFromMidpoint(b, originalA);
      else if (originalB !== null && originalA === null) source = sourceFromMidpoint(a, originalB);
      else if (originalA !== null && originalB !== null) source = sourceOf(originalA, originalB);
      addEdge(a, b, source);
    }
  }

  function sourceFromMidpoint(mid: number, corner: number): number | null {
    for (const [key, index] of midpointCache) {
      if (index !== mid) continue;
      const [a, b] = key.split(",").map(Number) as [number, number];
      return a === corner || b === corner ? sourceOf(a, b) : null;
    }
    return null;
  }

  const fold = {
    file_title: model.title,
    vertices_coords: coords[0],
    edges_vertices: edges,
    edges_assignment: edgeAssignments[0],
    faces_vertices: faces,
    file_frames: model.frames.slice(1).map((frame, i) => ({
      frame_title: frame.title,
      frame_description: frame.description,
      frame_parent: i,
      frame_inherit: true,
      vertices_coords: coords[i + 1],
      edges_assignment: edgeAssignments[i + 1],
    })),
  };

  const result = loadFold(JSON.stringify(fold));
  if (!result.ok) {
    throw new Error(`subdivision produced an invalid model: ${result.errors[0]?.message}`);
  }
  return result.model;
}

function distance(coords: ArrayLike<number>, a: number, b: number): number {
  return Math.hypot(
    coords[3 * a]! - coords[3 * b]!,
    coords[3 * a + 1]! - coords[3 * b + 1]!,
    coords[3 * a + 2]! - coords[3 * b + 2]!,
  );
}

function interiorAngles(coords: ArrayLike<number>, face: readonly number[]): number[] {
  return face.map((_, i) => {
    const previous = face[(i + face.length - 1) % face.length]!;
    const current = face[i]!;
    const next = face[(i + 1) % face.length]!;
    return cornerAngleDeg(coords, previous, current, next);
  });
}

function cornerAngleDeg(coords: ArrayLike<number>, a: number, b: number, c: number): number {
  const u = [0, 1, 2].map((k) => coords[3 * a + k]! - coords[3 * b + k]!);
  const v = [0, 1, 2].map((k) => coords[3 * c + k]! - coords[3 * b + k]!);
  const lu = Math.hypot(...u);
  const lv = Math.hypot(...v);
  if (lu === 0 || lv === 0) return 0;
  const cosine = (u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!) / (lu * lv);
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}
