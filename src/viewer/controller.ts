import type { FoldAnimator } from "@/animation/types";
import type { Assignment, ResolvedModel } from "@/fold";

export interface ViewerState {
  frameIndex: number;
  /**
   * How far through the current step the model is, 0 to 1. 0 is the previous step's shape and 1 is
   * this one's. Frame 0 has no step leading into it and always reads 1.
   */
  stepProgress: number;
  frameCount: number;
  transitioning: boolean;
  /** Edge ids highlighted for the frame being shown. */
  activeEdges: number[];
  creasePanelOpen: boolean;
}

type Listener = () => void;

type Point = [number, number, number];

/**
 * Framework-free core of the viewer: owns the frame sequence, the animator and the positions
 * buffer the renderer draws. React subscribes to it; the render loop calls `tick`.
 */
export class ViewerController {
  readonly positions: Float32Array;

  private readonly listeners = new Set<Listener>();
  private state: ViewerState;
  /** Set whenever the positions buffer changes outside a transition, so the scene redraws. */
  private positionsChanged = true;
  /** After a scrub, the animator may still be settling towards the shape at that position. */
  private settling = false;
  /** The two frames the paper is between, while a step plays or is scrubbed. */
  private between: [from: number, to: number] | null = null;
  /** The middle of the box around each frame, which the view turns about. */
  private readonly centres: Point[];

  constructor(
    private readonly model: ResolvedModel,
    private readonly animator: FoldAnimator,
  ) {
    this.positions = new Float32Array(model.vertexCount * 3);
    this.state = {
      frameIndex: 0,
      stepProgress: 1,
      frameCount: model.frames.length,
      transitioning: false,
      activeEdges: [],
      creasePanelOpen: false,
    };
    this.centres = model.frames.map((frame) => boxCentre(frame.coords));
    this.animator.init(model, this.positions);
    this.animator.jumpTo(0);
  }

  getState = (): ViewerState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  currentAssignments(): readonly Assignment[] {
    return this.model.frames[this.state.frameIndex]!.assignments;
  }

  /**
   * The frame whose stacking order to draw the paper in: of the two the paper is between, the one
   * it is nearer. Sheets only lie on each other near either end of a step, and there the order of
   * that end is the right one; the frame being moved to would be wrong while the paper is still
   * in the previous frame's stack.
   */
  stackingFrame(): number {
    if (!this.between) return this.state.frameIndex;
    const [from, to] = this.between;
    return this.distanceTo(from) < this.distanceTo(to) ? from : to;
  }

  /**
   * The point the view should turn about: the middle of the frame being shown, or part way between
   * two frames while a step is scrubbed. A folded model can end up far from the middle of the
   * sheet it started as, and turning about that would swing it round off to one side. When a step
   * plays this jumps straight to where it ends; the scene eases the view there.
   */
  viewCentre(): Point {
    const { frameIndex, stepProgress } = this.state;
    const to = this.centres[frameIndex]!;
    if (stepProgress === 1 || frameIndex === 0) return to;
    const from = this.centres[frameIndex - 1]!;
    return [0, 1, 2].map((k) => from[k]! + stepProgress * (to[k]! - from[k]!)) as Point;
  }

  private distanceTo(frame: number): number {
    const coords = this.model.frames[frame]!.coords;
    let worst = 0;
    for (let i = 0; i < coords.length; i++) {
      worst = Math.max(worst, Math.abs(this.positions[i]! - coords[i]!));
    }
    return worst;
  }

  currentFrame() {
    return this.model.frames[this.state.frameIndex]!;
  }

  next(): void {
    this.goTo(this.state.frameIndex + 1);
  }

  prev(): void {
    this.goTo(this.state.frameIndex - 1);
  }

  /** Starts animating to `index`. A transition already running is replaced, not queued. */
  goTo(index: number): void {
    const { frameIndex, frameCount } = this.state;
    if (index === frameIndex || index < 0 || index >= frameCount) return;
    this.settling = false;
    this.between = [frameIndex, index];
    this.animator.beginTransition(frameIndex, index);
    this.setState({
      frameIndex: index,
      stepProgress: 1,
      transitioning: true,
      activeEdges: this.activeEdgesFor(frameIndex, index),
    });
  }

  /**
   * Moves the model through the step it is on, 0 being the previous step's shape and 1 this one's.
   * This is what the scrubber drives; the step itself does not change, so the panel stays put
   * while a single fold is studied.
   */
  scrubStep(progress: number): void {
    const { frameIndex } = this.state;
    // Frame 0 is the starting shape: there is no step leading into it to scrub.
    if (frameIndex === 0) return;
    const clamped = Math.min(Math.max(progress, 0), 1);
    this.between = [frameIndex - 1, frameIndex];
    this.animator.seek(frameIndex - 1, frameIndex, clamped);
    this.positionsChanged = true;
    this.settling = true;
    this.setState({ stepProgress: clamped, transitioning: false });
  }

  toggleCreasePanel(open?: boolean): void {
    this.setState({ creasePanelOpen: open ?? !this.state.creasePanelOpen });
  }

  /** Advances the animation. Returns true when the positions buffer changed. */
  tick(dtSeconds: number): boolean {
    if (!this.state.transitioning) {
      if (this.settling) {
        // Scrubbing moves the model without a transition running; the animator finishes settling
        // over the next frames.
        this.positionsChanged = false;
        if (this.animator.step(dtSeconds) === "idle") this.settling = false;
        return true;
      }
      const changed = this.positionsChanged;
      this.positionsChanged = false;
      return changed;
    }
    const status = this.animator.step(dtSeconds);
    if (status === "idle") this.setState({ transitioning: false });
    return true;
  }

  dispose(): void {
    this.animator.dispose();
    this.listeners.clear();
  }

  /**
   * Going forward, the highlighted creases are the ones newly active in the destination frame.
   * Going back, they are the ones that were active in the step being undone, so the same creases
   * stay highlighted in both directions.
   */
  private activeEdgesFor(from: number, to: number): number[] {
    return to > from ? this.model.frames[to]!.newlyActive : this.model.frames[from]!.newlyActive;
  }

  private setState(patch: Partial<ViewerState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

function boxCentre(coords: ArrayLike<number>): Point {
  const low: Point = [Infinity, Infinity, Infinity];
  const high: Point = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < coords.length; i++) {
    const k = i % 3;
    low[k] = Math.min(low[k]!, coords[i]!);
    high[k] = Math.max(high[k]!, coords[i]!);
  }
  return [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
}
