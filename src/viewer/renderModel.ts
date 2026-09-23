import { triangulateFaces } from "@/fold/triangulate";
import type { Assignment, ResolvedModel } from "@/fold";

export interface RenderModel {
  /** Triangle vertex indices, three per triangle. */
  triangles: Uint32Array;
  /**
   * Which model vertex each drawn triangle vertex comes from. Triangles do not share vertices in
   * the drawn mesh, so each face can be nudged onto its own layer.
   */
  triangleSource: Uint32Array;
  /** The face each drawn triangle vertex belongs to, used as its layer. */
  triangleLayer: Uint32Array;
  /** Line vertex indices, two per model edge, in the model's edge order. */
  lines: Uint32Array;
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
  const triangleLayer = new Uint32Array(triangles.length * 3);
  triangles.forEach(([a, b, c], i) => {
    triangleIndices[3 * i] = a;
    triangleIndices[3 * i + 1] = b;
    triangleIndices[3 * i + 2] = c;
    for (let k = 0; k < 3; k++) {
      triangleSource[3 * i + k] = [a, b, c][k]!;
      triangleLayer[3 * i + k] = trianglesFace[i]!;
    }
  });

  const lines = new Uint32Array(model.edgesVertices.length * 2);
  model.edgesVertices.forEach(([a, b], e) => {
    lines[2 * e] = a;
    lines[2 * e + 1] = b;
  });

  return { triangles: triangleIndices, triangleSource, triangleLayer, lines, facetCreases };
}

/**
 * Fills the drawn mesh's positions, lifting each face onto its own layer along its normal.
 *
 * Folded flat, two halves of the sheet occupy exactly the same plane and the depth buffer cannot
 * tell them apart, which tears the surface into stripes of front and back. Giving the paper a
 * little thickness settles it. The offset is far too small to see, and the order is arbitrary
 * because v1 does not read `faceOrders` — it only has to be consistent from frame to frame.
 */
export function writeTrianglePositions(
  source: ArrayLike<number>,
  render: Pick<RenderModel, "triangleSource" | "triangleLayer">,
  thickness: number,
  out: Float32Array,
): void {
  const { triangleSource, triangleLayer } = render;
  for (let t = 0; t < triangleSource.length; t += 3) {
    const [ax, ay, az] = vertexOf(source, triangleSource[t]!);
    const [bx, by, bz] = vertexOf(source, triangleSource[t + 1]!);
    const [cx, cy, cz] = vertexOf(source, triangleSource[t + 2]!);

    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const length = Math.hypot(nx, ny, nz);
    // A degenerate triangle has no normal to lift along, so it stays where it is.
    const lift = length > 0 ? (thickness * (triangleLayer[t]! + 1)) / length : 0;
    nx *= lift;
    ny *= lift;
    nz *= lift;

    for (let k = 0; k < 3; k++) {
      const [x, y, z] = vertexOf(source, triangleSource[t + k]!);
      out[3 * (t + k)] = x + nx;
      out[3 * (t + k) + 1] = y + ny;
      out[3 * (t + k) + 2] = z + nz;
    }
  }
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
