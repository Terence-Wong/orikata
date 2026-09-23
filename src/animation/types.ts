import type { ResolvedModel } from "@/fold";

export type TransitionState = "running" | "landing" | "idle";

/**
 * Drives the vertex positions shown by the viewer. Implementations write into the buffer given to
 * `init` so the renderer can upload it without copying. The two prototypes (vertex interpolation
 * and the fold-angle solver) implement this identically so they can be swapped.
 */
export interface FoldAnimator {
  /** `out` holds xyz per vertex and is owned by the caller. */
  init(model: ResolvedModel, out: Float32Array): void;
  /** Places the model on a frame with no animation. */
  jumpTo(frame: number): void;
  beginTransition(from: number, to: number): void;
  /**
   * Places the model part-way between two frames, with no animation. `progress` runs 0 to 1. This
   * is what the scrubber uses, so it has to work in both directions and be safe to call repeatedly.
   */
  seek(from: number, to: number, progress: number): void;
  /** Advances by `dtSeconds`, writing into the positions buffer. */
  step(dtSeconds: number): TransitionState;
  readonly positions: Float32Array;
  dispose(): void;
}

/** Duration of one step transition, shared by every animator. */
export const TRANSITION_SECONDS = 0.8;
