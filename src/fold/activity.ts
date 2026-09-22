import type { Assignment } from "./types";

/** A crease whose fold angle changes by more than this between consecutive frames is "active". */
export const ACTIVE_ANGLE_THRESHOLD_DEG = 5;

interface FrameLike {
  assignments: readonly Assignment[];
  foldAngles: Float64Array;
}

const FOLDABLE: ReadonlySet<Assignment> = new Set(["M", "V"]);
const NOT_YET_FOLDED: ReadonlySet<Assignment> = new Set(["F", "U"]);

/**
 * Edges newly active in `current`: those whose assignment goes from F/U in the parent frame to
 * M/V, plus those whose fold angle moved by more than the threshold since the previous frame.
 * Angle differences are not wrapped: the physical path from +179° to −179° passes through 0°.
 * Returns sorted edge ids.
 */
export function newlyActiveEdges(
  current: FrameLike,
  parent: FrameLike | null,
  previous: FrameLike | null,
): number[] {
  const active: number[] = [];
  const edgeCount = current.assignments.length;
  for (let e = 0; e < edgeCount; e++) {
    const now = current.foldAngles[e]!;
    if (Number.isNaN(now)) continue;
    const newlyAssigned =
      parent !== null &&
      FOLDABLE.has(current.assignments[e]!) &&
      NOT_YET_FOLDED.has(parent.assignments[e]!);
    const before = previous?.foldAngles[e];
    const moved =
      before !== undefined &&
      !Number.isNaN(before) &&
      Math.abs(now - before) > ACTIVE_ANGLE_THRESHOLD_DEG;
    if (newlyAssigned || moved) active.push(e);
  }
  return active;
}
