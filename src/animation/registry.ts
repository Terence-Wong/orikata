import { InstantAnimator } from "./instant";
import { LerpAnimator } from "./lerp";
import type { FoldAnimator } from "./types";

/**
 * The animators the viewer can be asked for with `?animator=`. Both prototypes implement the same
 * interface so they can be compared on the same URL; `instant` skips animation entirely.
 */
export const ANIMATOR_NAMES = ["instant", "lerp"] as const;

export type AnimatorName = (typeof ANIMATOR_NAMES)[number];

export const DEFAULT_ANIMATOR: AnimatorName = "lerp";

const FACTORIES: Record<AnimatorName, () => FoldAnimator> = {
  instant: () => new InstantAnimator(),
  lerp: () => new LerpAnimator(),
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
