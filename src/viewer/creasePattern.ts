import type { Assignment, ResolvedModel } from "@/fold";

/** Side of the square the pattern is drawn into, in SVG user units. */
export const CREASE_PATTERN_SIZE = 200;
const MARGIN = 8;

export interface CreasePatternEdge {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The assignment in the frame being shown, which can differ from frame 0's. */
  assignment: Assignment;
  /** Whether this crease is newly active in the frame being shown (R6). */
  active: boolean;
}

export interface CreasePattern {
  size: number;
  edges: CreasePatternEdge[];
}

/**
 * Lays out the flat crease pattern for the 2D panel: always frame 0's geometry, coloured by the
 * assignments of the frame being shown, with that frame's newly-active creases marked. FOLD's y
 * axis points up and SVG's points down, so the layout flips it.
 */
export function buildCreasePattern(model: ResolvedModel, frameIndex: number): CreasePattern {
  const flat = model.frames[0]!.coords;
  const frame = model.frames[frameIndex]!;
  const active = new Set(frame.newlyActive);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let v = 0; v < model.vertexCount; v++) {
    minX = Math.min(minX, flat[3 * v]!);
    maxX = Math.max(maxX, flat[3 * v]!);
    minY = Math.min(minY, flat[3 * v + 1]!);
    maxY = Math.max(maxY, flat[3 * v + 1]!);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const usable = CREASE_PATTERN_SIZE - 2 * MARGIN;
  const scale = span > 0 ? usable / span : 1;
  const offsetX = (CREASE_PATTERN_SIZE - (maxX - minX) * scale) / 2;
  const offsetY = (CREASE_PATTERN_SIZE - (maxY - minY) * scale) / 2;

  const place = (v: number): [number, number] => [
    offsetX + (flat[3 * v]! - minX) * scale,
    // Flip y: the pattern should read the same way up as the model does.
    CREASE_PATTERN_SIZE - offsetY - (flat[3 * v + 1]! - minY) * scale,
  ];

  const edges = model.edgesVertices.map(([a, b], id) => {
    const [x1, y1] = place(a);
    const [x2, y2] = place(b);
    return { id, x1, y1, x2, y2, assignment: frame.assignments[id]!, active: active.has(id) };
  });

  return { size: CREASE_PATTERN_SIZE, edges };
}
