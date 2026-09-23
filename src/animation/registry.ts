import { InstantAnimator } from "./instant";
import { LerpAnimator } from "./lerp";
import { SolverAnimator } from "./solver/animator";
import type { FoldAnimator } from "./types";

/**
 * The animators the viewer can be asked for with `?animator=`. Both prototypes implement the same
 * interface so they can be compared on the same URL; `instant` skips animation entirely.
 */
export const ANIMATOR_NAMES = ["instant", "lerp", "solver"] as const;

export type AnimatorName = (typeof ANIMATOR_NAMES)[number];

/**
 * The solver is the default from the prototype comparison (reports/animation-comparison.md):
 * straight-line interpolation collapses an edge to nothing half way through any 180° fold.
 * `lerp` stays registered as a comparison point and a possible user-facing toggle.
 */
export const DEFAULT_ANIMATOR: AnimatorName = "solver";

/**
 * Above this many vertices the solver cannot keep up: its cost is linear in the model's size, and
 * the measurements in reports/animation-comparison.md put a 60 fps budget at roughly 725 vertices
 * and a 120 Hz one at roughly 360. Bigger models get vertex interpolation instead, which is worse
 * to look at but never drops a frame.
 */
export const SOLVER_VERTEX_LIMIT = 600;

const FACTORIES: Record<AnimatorName, () => FoldAnimator> = {
  instant: () => new InstantAnimator(),
  lerp: () => new LerpAnimator(),
  solver: () => new SolverAnimator(),
};

export function createAnimator(name: AnimatorName): FoldAnimator {
  return FACTORIES[name]();
}

/** Reads an animator name from a query parameter. Undefined when none was asked for. */
export function parseAnimatorName(
  value: string | string[] | null | undefined,
): AnimatorName | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return (ANIMATOR_NAMES as readonly string[]).includes(first ?? "")
    ? (first as AnimatorName)
    : undefined;
}

/**
 * Which animator to run. An explicit request always wins, so a large model can still be inspected
 * with the solver; otherwise the model's size decides.
 */
export function chooseAnimator(
  requested: AnimatorName | undefined,
  vertexCount: number,
): AnimatorName {
  if (requested) return requested;
  return vertexCount > SOLVER_VERTEX_LIMIT ? "lerp" : DEFAULT_ANIMATOR;
}
