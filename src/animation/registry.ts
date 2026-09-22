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

const FACTORIES: Record<AnimatorName, () => FoldAnimator> = {
  instant: () => new InstantAnimator(),
  lerp: () => new LerpAnimator(),
  solver: () => new SolverAnimator(),
};

export function createAnimator(name: AnimatorName): FoldAnimator {
  return FACTORIES[name]();
}

/** Reads an animator name from a query parameter, falling back to the default. */
export function parseAnimatorName(value: string | string[] | null | undefined): AnimatorName {
  const first = Array.isArray(value) ? value[0] : value;
  return (ANIMATOR_NAMES as readonly string[]).includes(first ?? "")
    ? (first as AnimatorName)
    : DEFAULT_ANIMATOR;
}
