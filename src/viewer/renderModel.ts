import { triangulateFaces } from "@/fold/triangulate";
import type { Assignment, ResolvedModel } from "@/fold";
import { faceLayers } from "./layers";

/**
 * How far a crease is drawn off its face, in sheets. Less than half a sheet, so a crease on one
 * layer never shows through the layer above it.
 */
const CREASE_LIFT = 0.3;

export interface RenderModel {
  /** Triangle vertex indices, three per triangle. */
  triangles: Uint32Array;
  /**
   * Which model vertex each drawn triangle vertex comes from. Triangles do not share vertices in
   * the drawn mesh, so each face can be nudged onto its own layer.
   */
  triangleSource: Uint32Array;
  /** The face each drawn triangle vertex belongs to. */
  triangleFace: Uint32Array;
  /**
   * A frame's layer per face (see `faceLayers`), so the stack order is right in every frame.
   * Worked out the first time a frame is shown, so a long file does not hold up loading.
   */
  layersAt(frame: number): Int32Array;
  /** Three vertices of one triangle per face, to measure the face's normal from. */
  faceCorners: Uint32Array;
  /**
   * Creases are drawn once per face they border and per side of that face, each copy lifted off
   * the face's own surface; a crease on a buried layer is then hidden by the layers above it.
   * Two model vertex indices per copy.
   */
  creaseVertices: Uint32Array;
  /** The edge, face and side (+1 front, −1 back) of each crease copy. */
  creaseEdge: Uint32Array;
  creaseFace: Uint32Array;
  creaseSide: Int8Array;
  /** Diagonals added by triangulation; not drawn, but needed by the solver. */
  facetCreases: [number, number][];
}

/** Crease colours: mountain red, valley blue, boundary dark, everything else neutral (R4). */
export const CREASE_COLORS: Record<Assignment, number> = {
  M: 0xd2262c,
  V: 0x1f5fd0,
  B: 0x4a4a4a,
  F: 0xb9b9b9,
  U: 0xb9b9b9,
  C: 0xb9b9b9,
  J: 0xb9b9b9,
};

export function buildRenderModel(model: ResolvedModel): RenderModel {
  const flat = model.frames[0]!.coords;
  const { triangles, trianglesFace, facetCreases } = triangulateFaces(flat, model.facesVertices);

  const triangleIndices = new Uint32Array(triangles.length * 3);
  const triangleSource = new Uint32Array(triangles.length * 3);
  const triangleFace = new Uint32Array(triangles.length * 3);
  const faceCorners = new Uint32Array(model.facesVertices.length * 3);
  const cornered = new Uint8Array(model.facesVertices.length);
  triangles.forEach(([a, b, c], i) => {
    const face = trianglesFace[i]!;
    triangleIndices[3 * i] = a;
    triangleIndices[3 * i + 1] = b;
    triangleIndices[3 * i + 2] = c;
    for (let k = 0; k < 3; k++) {
      triangleSource[3 * i + k] = [a, b, c][k]!;
      triangleFace[3 * i + k] = face;
    }
    if (!cornered[face]) {
      cornered[face] = 1;
      faceCorners.set([a, b, c], 3 * face);
    }
  });

  const vertices: number[] = [];
  const edges: number[] = [];
  const faces: number[] = [];
  const sides: number[] = [];
  model.edgesVertices.forEach(([a, b], e) => {
    for (const face of model.edgesFaces[e]!) {
      for (const side of [1, -1]) {
        vertices.push(a, b);
        edges.push(e);
        faces.push(face);
        sides.push(side);
      }
    }
  });

  const layers: Array<Int32Array | undefined> = [];
  return {
    triangles: triangleIndices,
    triangleSource,
    triangleFace,
    layersAt: (frame) => (layers[frame] ??= faceLayers(model, frame)),
    faceCorners,
    creaseVertices: Uint32Array.from(vertices),
    creaseEdge: Uint32Array.from(edges),
    creaseFace: Uint32Array.from(faces),
    creaseSide: Int8Array.from(sides),
    facetCreases,
  };
}

/**
 * Fills the drawn mesh: `positions` exactly where the model is, and `lifts` the offset along each
 * face's normal of its layer times the paper's thickness. The scene draws each triangle at its
 * position but writes the depth it would have at position + lift.
 *
 * Folded flat, two halves of the sheet occupy exactly the same plane and the depth buffer cannot
 * tell them apart. Lifting only the depth puts the sheets in the order the folds say (see
 * `faceLayers`) without moving anything on screen, so no gap can open between faces on different
 * layers.
 */
export function writeTriangles(
  source: ArrayLike<number>,
  render: Pick<RenderModel, "triangleSource" | "triangleFace">,
  layers: Int32Array,
  thickness: number,
  positions: Float32Array,
  lifts: Float32Array,
): void {
  const { triangleSource, triangleFace } = render;
  for (let t = 0; t < triangleSource.length; t += 3) {
    const [nx, ny, nz] = unitNormal(
      source,
      triangleSource[t]!,
      triangleSource[t + 1]!,
      triangleSource[t + 2]!,
    );
    const lift = thickness * layers[triangleFace[t]!]!;
    for (let k = 0; k < 3; k++) {
      const i = 3 * (t + k);
      const [x, y, z] = vertexOf(source, triangleSource[t + k]!);
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = z;
      lifts[i] = nx * lift;
      lifts[i + 1] = ny * lift;
      lifts[i + 2] = nz * lift;
    }
  }
}

/**
 * Fills the crease lines the same way: on the model, with each copy's depth lifted just off its
 * face's layer on its own side, so a crease shows on the sheet it belongs to and is hidden by the
 * sheets above it.
 */
export function writeCreases(
  source: ArrayLike<number>,
  render: Pick<RenderModel, "creaseVertices" | "creaseFace" | "creaseSide" | "faceCorners">,
  layers: Int32Array,
  thickness: number,
  positions: Float32Array,
  lifts: Float32Array,
): void {
  const { creaseVertices, creaseFace, creaseSide, faceCorners } = render;
  for (let copy = 0; copy < creaseFace.length; copy++) {
    const face = creaseFace[copy]!;
    const [nx, ny, nz] = unitNormal(
      source,
      faceCorners[3 * face]!,
      faceCorners[3 * face + 1]!,
      faceCorners[3 * face + 2]!,
    );
    const lift = thickness * (layers[face]! + creaseSide[copy]! * CREASE_LIFT);
    for (let k = 0; k < 2; k++) {
      const i = 3 * (2 * copy + k);
      const [x, y, z] = vertexOf(source, creaseVertices[2 * copy + k]!);
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = z;
      lifts[i] = nx * lift;
      lifts[i + 1] = ny * lift;
      lifts[i + 2] = nz * lift;
    }
  }
}

/** A degenerate triangle has no normal to lift along, so it gets none and stays where it is. */
function unitNormal(
  source: ArrayLike<number>,
  a: number,
  b: number,
  c: number,
): [number, number, number] {
  const [ax, ay, az] = vertexOf(source, a);
  const [bx, by, bz] = vertexOf(source, b);
  const [cx, cy, cz] = vertexOf(source, c);
  const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const length = Math.hypot(nx, ny, nz);
  return length > 0 ? [nx / length, ny / length, nz / length] : [0, 0, 0];
}

function vertexOf(source: ArrayLike<number>, v: number): [number, number, number] {
  return [source[3 * v]!, source[3 * v + 1]!, source[3 * v + 2]!];
}

export interface CameraFit {
  center: [number, number, number];
  /** Radius of a sphere around the centre containing every frame. */
  radius: number;
  /** Distance from the centre at which the whole sphere fits in view. */
  distance: number;
}

/** Frames the model so no frame leaves the view, with a little room to spare. */
export function fitCamera(model: ResolvedModel, fovDegrees: number, aspect: number): CameraFit {
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
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const half = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  const radius = half > 0 ? half : 1;

  const fov = (fovDegrees * Math.PI) / 180;
  const verticalFit = radius / Math.sin(fov / 2);
  // A narrow viewport shrinks the horizontal field of view, so the camera has to back off further.
  const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * Math.max(aspect, 1e-3));
  const horizontalFit = radius / Math.sin(horizontalFov / 2);
  return { center, radius, distance: Math.max(verticalFit, horizontalFit) * 1.15 };
}
