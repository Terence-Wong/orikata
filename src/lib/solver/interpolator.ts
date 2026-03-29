/**
 * Edge-length-preserving vertex interpolation between two FOLD frame states.
 *
 * Strategy:
 * 1. Linearly interpolate vertex positions (lerp)
 * 2. Project onto constraint manifold by iteratively correcting edge lengths
 *    (position-based dynamics style)
 */

/** Ease-in-out cubic for smooth animation feel */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface InterpolatorConfig {
  /** Number of constraint projection iterations per frame (default: 3) */
  constraintIterations?: number;
  /** Whether to preserve edge lengths (default: true) */
  preserveEdgeLengths?: boolean;
}

export class VertexInterpolator {
  private from: Float32Array;
  private to: Float32Array;
  private edgePairs: [number, number][];
  private restLengths: Float32Array;
  private vertexCount: number;
  private config: Required<InterpolatorConfig>;

  constructor(
    fromCoords: number[][],
    toCoords: number[][],
    edgesVertices: [number, number][],
    config: InterpolatorConfig = {}
  ) {
    this.vertexCount = fromCoords.length;
    this.config = {
      constraintIterations: config.constraintIterations ?? 3,
      preserveEdgeLengths: config.preserveEdgeLengths ?? true,
    };

    // Flatten to Float32Arrays (ensure 3D)
    this.from = new Float32Array(this.vertexCount * 3);
    this.to = new Float32Array(this.vertexCount * 3);

    for (let i = 0; i < this.vertexCount; i++) {
      this.from[i * 3] = fromCoords[i][0];
      this.from[i * 3 + 1] = fromCoords[i][1];
      this.from[i * 3 + 2] = fromCoords[i][2] ?? 0;

      this.to[i * 3] = toCoords[i][0];
      this.to[i * 3 + 1] = toCoords[i][1];
      this.to[i * 3 + 2] = toCoords[i][2] ?? 0;
    }

    this.edgePairs = edgesVertices;

    // Compute rest lengths from the "from" state
    // (paper edge lengths should be constant throughout folding)
    this.restLengths = new Float32Array(edgesVertices.length);
    for (let i = 0; i < edgesVertices.length; i++) {
      const [a, b] = edgesVertices[i];
      const dx = this.from[a * 3] - this.from[b * 3];
      const dy = this.from[a * 3 + 1] - this.from[b * 3 + 1];
      const dz = this.from[a * 3 + 2] - this.from[b * 3 + 2];
      this.restLengths[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }

  /**
   * Compute interpolated vertex positions at parameter t (0 = from, 1 = to).
   * Returns a Float32Array of length vertexCount * 3.
   */
  evaluate(t: number): Float32Array {
    const eased = easeInOutCubic(Math.max(0, Math.min(1, t)));
    const result = new Float32Array(this.vertexCount * 3);

    // Step 1: Linear interpolation
    for (let i = 0; i < result.length; i++) {
      result[i] = this.from[i] + (this.to[i] - this.from[i]) * eased;
    }

    // Step 2: Edge-length constraint projection
    if (this.config.preserveEdgeLengths) {
      for (let iter = 0; iter < this.config.constraintIterations; iter++) {
        this.projectEdgeLengths(result);
      }
    }

    return result;
  }

  /**
   * Position-based dynamics edge-length correction.
   * For each edge, if current length != rest length, move both vertices
   * equally along the edge axis to restore the rest length.
   */
  private projectEdgeLengths(positions: Float32Array) {
    for (let i = 0; i < this.edgePairs.length; i++) {
      const [a, b] = this.edgePairs[i];
      const rest = this.restLengths[i];
      if (rest < 1e-10) continue; // degenerate edge

      const ax = a * 3, ay = a * 3 + 1, az = a * 3 + 2;
      const bx = b * 3, by = b * 3 + 1, bz = b * 3 + 2;

      const dx = positions[bx] - positions[ax];
      const dy = positions[by] - positions[ay];
      const dz = positions[bz] - positions[az];
      const currentLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (currentLen < 1e-10) continue;

      const correction = (currentLen - rest) / currentLen * 0.5;

      positions[ax] += dx * correction;
      positions[ay] += dy * correction;
      positions[az] += dz * correction;
      positions[bx] -= dx * correction;
      positions[by] -= dy * correction;
      positions[bz] -= dz * correction;
    }
  }
}
