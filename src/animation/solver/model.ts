import type { ResolvedModel } from "@/fold";
import { triangulateFaces } from "@/fold/triangulate";
import { cornerAngle } from "./corner";
import { hingeAngle, type HingeNodes } from "./hinge";

/**
 * Material constants from Origami Simulator (Ghassaei, Demaine, Gershenfeld, 7OSME 2018). They are
 * meaningful because the model is normalised to a unit bounding box first.
 */
export const AXIAL_EA = 20;
export const CREASE_STIFFNESS = 0.7;
export const FACET_STIFFNESS = 0.2;
export const FACE_STIFFNESS = 0.2;
export const DAMPING_RATIO = 0.45;
/** Fraction of the explicit stability limit used for the timestep. */
export const TIMESTEP_SAFETY = 0.25;

export interface AxialSpring {
  a: number;
  b: number;
  restLength: number;
  k: number;
}

export interface Hinge {
  nodes: HingeNodes;
  k: number;
  /** Index into the model's edges, or −1 for a diagonal added by triangulation. */
  edgeIndex: number;
}

export interface Corner {
  a: number;
  b: number;
  c: number;
  restAngle: number;
}

export interface SolverModel {
  vertexCount: number;
  axial: AxialSpring[];
  hinges: Hinge[];
  corners: Corner[];
  /** Per-node stiffness used for damping and the timestep. */
  nodeStiffness: Float64Array;
  dt: number;
  /** Normalised = (world − offset) × scale. */
  scale: number;
  offset: [number, number, number];
}

/**
 * Builds the spring network from the model's triangulated frame 0. Coordinates are normalised to a
 * unit bounding box so the constants above mean the same thing for every model.
 */
export function buildSolverModel(model: ResolvedModel): SolverModel {
  const { triangles, facetCreases } = triangulateFaces(
    model.frames[0]!.coords,
    model.facesVertices,
  );
  const { scale, offset } = normalisation(model);
  const rest = normalise(model.frames[0]!.coords, scale, offset);

  const modelEdgeByKey = new Map<string, number>();
  model.edgesVertices.forEach(([a, b], e) => modelEdgeByKey.set(key(a, b), e));
  const facetKeys = new Set(facetCreases.map(([a, b]) => key(a, b)));

  const axial: AxialSpring[] = [];
  const seen = new Set<string>();
  const addAxial = (a: number, b: number) => {
    const k = key(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    const restLength = distance(rest, a, b);
    axial.push({ a, b, restLength, k: restLength > 0 ? AXIAL_EA / restLength : AXIAL_EA });
  };

  const sides = new Map<string, { from: number; to: number; opposite: number }[]>();
  const corners: Corner[] = [];
  for (const [p, q, r] of triangles) {
    addAxial(p, q);
    addAxial(q, r);
    addAxial(r, p);

    // One corner per vertex: the angle at the middle node, between the arms to the other two.
    for (const [a, b, c] of [
      [q, p, r],
      [r, q, p],
      [p, r, q],
    ] as const) {
      corners.push({ a, b, c, restAngle: cornerAngle(rest, { a, b, c }) });
    }

    // Directed sides, each with the vertex opposite it, so hinges can find their four nodes.
    for (const [from, to, opposite] of [
      [p, q, r],
      [q, r, p],
      [r, p, q],
    ] as const) {
      const list = sides.get(key(from, to)) ?? [];
      list.push({ from, to, opposite });
      sides.set(key(from, to), list);
    }
  }

  const hinges: Hinge[] = [];
  for (const [edgeKey, list] of sides) {
    if (list.length !== 2) continue; // a boundary edge has no hinge
    const [first, second] = list as [(typeof list)[0], (typeof list)[0]];
    const nodes: HingeNodes = {
      a: first.from,
      b: first.to,
      c: first.opposite,
      d: second.opposite,
    };
    const edgeIndex = modelEdgeByKey.get(edgeKey) ?? -1;
    const isFacet = edgeIndex === -1 || facetKeys.has(edgeKey);
    const length = distance(rest, nodes.a, nodes.b);
    hinges.push({
      nodes,
      k: (isFacet ? FACET_STIFFNESS : CREASE_STIFFNESS) * length,
      edgeIndex,
    });
  }

  const nodeStiffness = computeNodeStiffness(model.vertexCount, rest, axial, hinges, corners);
  let maxStiffness = 0;
  for (const value of nodeStiffness) maxStiffness = Math.max(maxStiffness, value);
  // Explicit integration is stable below 2/ω; the safety factor leaves room for the stiffening that
  // comes with thin triangles part-way through a fold.
  const dt = maxStiffness > 0 ? (TIMESTEP_SAFETY * 2) / Math.sqrt(maxStiffness) : 1e-3;

  return {
    vertexCount: model.vertexCount,
    axial,
    hinges,
    corners,
    nodeStiffness,
    dt,
    scale,
    offset,
  };
}

/** Target fold angles in radians, one per hinge, for a stored frame. Facet creases stay flat. */
export function frameTargets(
  model: ResolvedModel,
  solver: SolverModel,
  frame: number,
): Float64Array {
  const angles = model.frames[frame]!.foldAngles;
  const targets = new Float64Array(solver.hinges.length);
  solver.hinges.forEach((hinge, i) => {
    if (hinge.edgeIndex === -1) return;
    const degrees = angles[hinge.edgeIndex]!;
    targets[i] = Number.isNaN(degrees) ? 0 : (degrees * Math.PI) / 180;
  });
  return targets;
}

/** Fold angles of a normalised configuration, one per hinge, in radians. */
export function measureAngles(coords: Float64Array, solver: SolverModel, out: Float64Array): void {
  solver.hinges.forEach((hinge, i) => {
    out[i] = hingeAngle(coords, hinge.nodes);
  });
}

export function normalise(
  coords: Float64Array,
  scale: number,
  offset: readonly [number, number, number],
): Float64Array {
  const out = new Float64Array(coords.length);
  for (let i = 0; i < coords.length; i += 3) {
    for (let k = 0; k < 3; k++) out[i + k] = (coords[i + k]! - offset[k]!) * scale;
  }
  return out;
}

export function denormalise(
  coords: Float64Array,
  scale: number,
  offset: readonly [number, number, number],
  out: Float32Array,
): void {
  for (let i = 0; i < coords.length; i += 3) {
    for (let k = 0; k < 3; k++) out[i + k] = coords[i + k]! / scale + offset[k]!;
  }
}

function normalisation(model: ResolvedModel): {
  scale: number;
  offset: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const frame of model.frames) {
    for (let i = 0; i < frame.coords.length; i += 3) {
      for (let k = 0 as 0 | 1 | 2; k < 3; k++) {
        const value = frame.coords[i + k]!;
        if (value < min[k]) min[k] = value;
        if (value > max[k]) max[k] = value;
      }
    }
  }
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return {
    scale: span > 0 ? 1 / span : 1,
    offset: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  };
}

/**
 * Translational stiffness seen by each node at rest. Axial springs contribute directly; angular
 * springs contribute k|∇angle|², which is how stiff they feel to a node moving in the worst
 * direction.
 */
function computeNodeStiffness(
  vertexCount: number,
  rest: Float64Array,
  axial: AxialSpring[],
  hinges: Hinge[],
  corners: Corner[],
): Float64Array {
  const stiffness = new Float64Array(vertexCount);
  for (const spring of axial) {
    stiffness[spring.a] = stiffness[spring.a]! + spring.k;
    stiffness[spring.b] = stiffness[spring.b]! + spring.k;
  }
  for (const hinge of hinges) {
    const { a, b } = hinge.nodes;
    const h1 = pointLineDistance(rest, hinge.nodes.c, a, b);
    const h2 = pointLineDistance(rest, hinge.nodes.d, a, b);
    const worst = Math.max(h1 > 0 ? 1 / h1 : 0, h2 > 0 ? 1 / h2 : 0);
    const contribution = hinge.k * worst * worst;
    for (const node of [a, b, hinge.nodes.c, hinge.nodes.d]) {
      stiffness[node] = stiffness[node]! + contribution;
    }
  }
  for (const corner of corners) {
    const arm = Math.min(distance(rest, corner.a, corner.b), distance(rest, corner.c, corner.b));
    const contribution = arm > 0 ? FACE_STIFFNESS / (arm * arm) : FACE_STIFFNESS;
    for (const node of [corner.a, corner.b, corner.c]) {
      stiffness[node] = stiffness[node]! + contribution;
    }
  }
  return stiffness;
}

function distance(coords: Float64Array, a: number, b: number): number {
  return Math.hypot(
    coords[3 * a]! - coords[3 * b]!,
    coords[3 * a + 1]! - coords[3 * b + 1]!,
    coords[3 * a + 2]! - coords[3 * b + 2]!,
  );
}

function pointLineDistance(coords: Float64Array, p: number, a: number, b: number): number {
  const ex = coords[3 * b]! - coords[3 * a]!;
  const ey = coords[3 * b + 1]! - coords[3 * a + 1]!;
  const ez = coords[3 * b + 2]! - coords[3 * a + 2]!;
  const px = coords[3 * p]! - coords[3 * a]!;
  const py = coords[3 * p + 1]! - coords[3 * a + 1]!;
  const pz = coords[3 * p + 2]! - coords[3 * a + 2]!;
  const length = Math.hypot(ex, ey, ez);
  if (length === 0) return 0;
  return Math.hypot(ey * pz - ez * py, ez * px - ex * pz, ex * py - ey * px) / length;
}

function key(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}
