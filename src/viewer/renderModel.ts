import { triangulateFaces } from "@/fold/triangulate";
import type { Assignment, ResolvedModel } from "@/fold";

export interface RenderModel {
  /** Triangle vertex indices, three per triangle. */
  triangles: Uint32Array;
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
  const { triangles, facetCreases } = triangulateFaces(flat, model.facesVertices);

  const triangleIndices = new Uint32Array(triangles.length * 3);
  triangles.forEach(([a, b, c], i) => {
    triangleIndices[3 * i] = a;
    triangleIndices[3 * i + 1] = b;
    triangleIndices[3 * i + 2] = c;
  });

  const lines = new Uint32Array(model.edgesVertices.length * 2);
  model.edgesVertices.forEach(([a, b], e) => {
    lines[2 * e] = a;
    lines[2 * e + 1] = b;
  });

  return { triangles: triangleIndices, lines, facetCreases };
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
