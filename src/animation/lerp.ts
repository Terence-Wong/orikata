import type { ResolvedModel } from "@/fold";
import { easeInOutCubic } from "./easing";
import { TRANSITION_SECONDS, type FoldAnimator, type TransitionState } from "./types";

/**
 * Prototype A: straight-line interpolation of each vertex between two frames, with eased timing.
 * Every step lands exactly on the stored geometry, but faces are free to shrink and distort on the
 * way, because nothing holds edge lengths fixed.
 */
export class LerpAnimator implements FoldAnimator {
  positions: Float32Array = new Float32Array(0);

  private frames: Float64Array[] = [];
  private from: Float64Array | null = null;
  private to: Float64Array | null = null;
  private elapsed = 0;

  init(model: ResolvedModel, out: Float32Array): void {
    this.positions = out;
    this.frames = model.frames.map((frame) => frame.coords);
  }

  jumpTo(frame: number): void {
    const coords = this.frames[frame];
    if (!coords) return;
    this.from = null;
    this.to = null;
    this.positions.set(coords);
  }

  beginTransition(from: number, to: number): void {
    const start = this.frames[from];
    const end = this.frames[to];
    if (!start || !end) return;
    this.from = start;
    this.to = end;
    this.elapsed = 0;
    this.positions.set(start);
  }

  seek(from: number, to: number, progress: number): void {
    const start = this.frames[from];
    const end = this.frames[to];
    if (!start || !end) return;
    this.from = null;
    this.to = null;
    const s = Math.min(Math.max(progress, 0), 1);
    for (let i = 0; i < this.positions.length; i++) {
      const a = start[i]!;
      this.positions[i] = a + s * (end[i]! - a);
    }
  }

  step(dtSeconds: number): TransitionState {
    const { from, to } = this;
    if (!from || !to) return "idle";

    this.elapsed += dtSeconds;
    if (this.elapsed >= TRANSITION_SECONDS) {
      this.positions.set(to);
      this.from = null;
      this.to = null;
      return "idle";
    }

    const s = easeInOutCubic(this.elapsed / TRANSITION_SECONDS);
    for (let i = 0; i < this.positions.length; i++) {
      const a = from[i]!;
      this.positions[i] = a + s * (to[i]! - a);
    }
    return "running";
  }

  dispose(): void {
    this.frames = [];
    this.from = null;
    this.to = null;
  }
}
