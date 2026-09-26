import { TRANSITION_SECONDS } from "@/animation/types";

/**
 * How quickly a follower closes on its target, per second. Critically damped, it is within 2% of
 * the way when a step finishes playing, so the view arrives with the paper.
 */
const RATE = 6.6 / TRANSITION_SECONDS;
/** Close enough to stop, as a fraction of the model's size: far too little to see. */
const ARRIVED = 1e-4;

/**
 * Moves a point towards a target like a critically damped spring: it sets off gently, never
 * overshoots and settles exactly, and takes the same path whatever the frame rate. The scene uses
 * one to carry the view along with the paper.
 */
export class Follow {
  readonly value: [number, number, number];
  private readonly velocity: [number, number, number] = [0, 0, 0];

  /** `scale` is the size of the model, which sets how close counts as arrived. */
  constructor(
    start: readonly number[],
    private readonly scale: number,
  ) {
    this.value = [start[0]!, start[1]!, start[2]!];
  }

  /** Moves `dt` seconds towards `target`. Returns false once it is there and at rest. */
  step(target: readonly number[], dt: number): boolean {
    const decay = Math.exp(-RATE * dt);
    let still = true;
    for (let k = 0; k < 3; k++) {
      const offset = this.value[k]! - target[k]!;
      const velocity = this.velocity[k]!;
      if (
        Math.abs(offset) < ARRIVED * this.scale &&
        Math.abs(velocity) < RATE * ARRIVED * this.scale
      ) {
        this.value[k] = target[k]!;
        this.velocity[k] = 0;
        continue;
      }
      still = false;
      // The spring's exact motion over dt, so a long frame lands where short ones would.
      const drive = (velocity + RATE * offset) * dt;
      this.value[k] = target[k]! + (offset + drive) * decay;
      this.velocity[k] = (velocity - RATE * drive) * decay;
    }
    return !still;
  }
}
