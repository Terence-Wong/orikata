import type { ResolvedModel } from "@/fold";
import type { FoldAnimator, TransitionState } from "./types";

/**
 * Shows each frame's stored geometry with no animation. Used by the viewer shell and as the
 * reference for tests that care about frames rather than motion.
 */
export class InstantAnimator implements FoldAnimator {
  positions: Float32Array = new Float32Array(0);
  private frames: Float64Array[] = [];

  init(model: ResolvedModel, out: Float32Array): void {
    this.positions = out;
    this.frames = model.frames.map((frame) => frame.coords);
  }

  jumpTo(frame: number): void {
    const coords = this.frames[frame];
    if (!coords) return;
    this.positions.set(coords);
  }

  beginTransition(_from: number, to: number): void {
    this.jumpTo(to);
  }

  seek(from: number, to: number, progress: number): void {
    this.jumpTo(progress >= 1 ? to : from);
  }

  step(): TransitionState {
    return "idle";
  }

  dispose(): void {
    this.frames = [];
  }
}
