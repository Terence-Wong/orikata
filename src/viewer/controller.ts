import type { FoldAnimator } from "@/animation/types";
import type { Assignment, ResolvedModel } from "@/fold";

export interface ViewerState {
  frameIndex: number;
  /**
   * Where the model sits in the whole sequence, as a fraction: 1.5 is half way from step 1 to
   * step 2. Whole numbers whenever a step has been reached.
   */
  position: number;
  frameCount: number;
  transitioning: boolean;
  /** Edge ids highlighted for the frame being shown. */
  activeEdges: number[];
  creasePanelOpen: boolean;
}

type Listener = () => void;

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

  constructor(
    private readonly model: ResolvedModel,
    private readonly animator: FoldAnimator,
  ) {
    this.positions = new Float32Array(model.vertexCount * 3);
    this.state = {
      frameIndex: 0,
      position: 0,
      frameCount: model.frames.length,
      transitioning: false,
      activeEdges: [],
      creasePanelOpen: false,
    };
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
    this.animator.beginTransition(frameIndex, index);
    this.setState({
      frameIndex: index,
      position: index,
      transitioning: true,
      activeEdges: this.activeEdgesFor(frameIndex, index),
    });
  }

  /**
   * Places the model anywhere in the sequence, with no animation: 1.5 is half way from step 1 to
   * step 2. This is what the scrubber drives.
   */
  scrubTo(position: number): void {
    const { frameCount } = this.state;
    const clamped = Math.min(Math.max(position, 0), frameCount - 1);
    const from = Math.min(Math.floor(clamped), frameCount - 2);
    const to = from + 1;
    const progress = clamped - from;
    this.animator.seek(from, to, progress);
    this.positionsChanged = true;
    this.setState({
      frameIndex: Math.round(clamped),
      position: clamped,
      transitioning: false,
      // The creases being worked on are the ones that move in the step being scrubbed through.
      activeEdges: this.model.frames[to]!.newlyActive,
    });
  }

  toggleCreasePanel(open?: boolean): void {
    this.setState({ creasePanelOpen: open ?? !this.state.creasePanelOpen });
  }

  /** Advances the animation. Returns true when the positions buffer changed. */
  tick(dtSeconds: number): boolean {
    if (!this.state.transitioning) {
      // Scrubbing moves the model without a transition running, so the scene is told once.
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
