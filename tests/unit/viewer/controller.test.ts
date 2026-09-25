import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoldAnimator, TransitionState } from "@/animation/types";
import { loadFold, type ResolvedModel } from "@/fold";
import { ViewerController } from "@/viewer/controller";
import { readFixture } from "../../helpers/fixtures";

function model(name: "book-fold" | "book-fold-90" | "preliminary-base"): ResolvedModel {
  const result = loadFold(readFixture("valid", name));
  if (!result.ok) throw new Error("fixture should load");
  return result.model;
}

/** Records the calls the controller makes and finishes a transition after a fixed number of steps. */
class FakeAnimator implements FoldAnimator {
  positions: Float32Array = new Float32Array(0);
  readonly calls: string[] = [];
  stepsRemaining = 0;
  stepsPerTransition = 2;

  init(m: ResolvedModel, out: Float32Array) {
    this.positions = out;
    this.calls.push(`init:${m.vertexCount}`);
  }
  jumpTo(frame: number) {
    this.calls.push(`jumpTo:${frame}`);
    this.stepsRemaining = 0;
  }
  beginTransition(from: number, to: number) {
    this.calls.push(`begin:${from}->${to}`);
    this.stepsRemaining = this.stepsPerTransition;
  }
  seek(from: number, to: number, progress: number) {
    this.calls.push(`seek:${from}->${to}@${progress.toFixed(2)}`);
    this.stepsRemaining = 0;
  }
  step(): TransitionState {
    if (this.stepsRemaining === 0) return "idle";
    this.stepsRemaining -= 1;
    return this.stepsRemaining === 0 ? "idle" : "running";
  }
  dispose() {
    this.calls.push("dispose");
  }
}

describe("ViewerController", () => {
  let animator: FakeAnimator;
  let controller: ViewerController;

  beforeEach(() => {
    animator = new FakeAnimator();
    controller = new ViewerController(model("book-fold-90"), animator);
  });

  it("starts at frame 0 with the animator initialised and jumped there", () => {
    expect(controller.getState()).toEqual({
      frameIndex: 0,
      stepProgress: 1,
      frameCount: 3,
      transitioning: false,
      activeEdges: [],
      creasePanelOpen: false,
    });
    expect(animator.calls).toEqual(["init:6", "jumpTo:0"]);
  });

  it("shares one positions buffer with the animator, sized three floats per vertex", () => {
    expect(controller.positions).toBe(animator.positions);
    expect(controller.positions).toHaveLength(18);
  });

  it("animates forward and reports the destination frame's newly-active edges", () => {
    controller.next();
    const state = controller.getState();
    expect(state.frameIndex).toBe(1);
    expect(state.transitioning).toBe(true);
    expect(state.activeEdges).toEqual([6]);
    expect(animator.calls).toContain("begin:0->1");
  });

  it("draws once when it is first created", () => {
    expect(controller.tick(1 / 60)).toBe(true);
    expect(controller.tick(1 / 60)).toBe(false);
  });

  it("clears the transitioning flag once the animator goes idle", () => {
    controller.tick(1 / 60);
    controller.next();
    expect(controller.tick(1 / 60)).toBe(true);
    expect(controller.getState().transitioning).toBe(true);
    expect(controller.tick(1 / 60)).toBe(true);
    expect(controller.getState().transitioning).toBe(false);
    // Ticking while idle does not redraw.
    expect(controller.tick(1 / 60)).toBe(false);
  });

  it("animates backwards and shows the edges that move in the step being undone", () => {
    controller.goTo(2);
    controller.tick(1 / 60);
    controller.tick(1 / 60);
    animator.calls.length = 0;
    controller.prev();
    expect(controller.getState().frameIndex).toBe(1);
    expect(animator.calls).toEqual(["begin:2->1"]);
    expect(controller.getState().activeEdges).toEqual([6]);
  });

  it("does nothing at the ends of the sequence", () => {
    controller.prev();
    expect(controller.getState().frameIndex).toBe(0);
    controller.goTo(2);
    animator.calls.length = 0;
    controller.next();
    expect(controller.getState().frameIndex).toBe(2);
    expect(animator.calls).toEqual([]);
  });

  it("ignores goTo for the current frame or an index out of range", () => {
    animator.calls.length = 0;
    controller.goTo(0);
    controller.goTo(-1);
    controller.goTo(99);
    expect(animator.calls).toEqual([]);
  });

  it("starts the next transition immediately when one is already running", () => {
    controller.next();
    animator.calls.length = 0;
    controller.next();
    expect(controller.getState().frameIndex).toBe(2);
    expect(animator.calls).toEqual(["begin:1->2"]);
  });

  it("notifies subscribers on every state change and not otherwise", () => {
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.next();
    expect(listener).toHaveBeenCalledTimes(1);
    controller.tick(1 / 60);
    expect(listener).toHaveBeenCalledTimes(1); // still transitioning: no state change
    controller.tick(1 / 60);
    expect(listener).toHaveBeenCalledTimes(2); // transition finished
    unsubscribe();
    controller.prev();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns a stable state object until something changes", () => {
    const before = controller.getState();
    expect(controller.getState()).toBe(before);
    controller.toggleCreasePanel();
    expect(controller.getState()).not.toBe(before);
    expect(controller.getState().creasePanelOpen).toBe(true);
    controller.toggleCreasePanel(true);
    expect(controller.getState().creasePanelOpen).toBe(true);
    controller.toggleCreasePanel(false);
    expect(controller.getState().creasePanelOpen).toBe(false);
  });

  it("exposes the assignments of the frame being shown", () => {
    const book = new ViewerController(model("book-fold"), new FakeAnimator());
    expect(book.currentAssignments()[6]).toBe("U");
    book.next();
    expect(book.currentAssignments()[6]).toBe("V");
  });

  it("scrubs within the step it is on, without changing which step that is", () => {
    controller.goTo(2);
    animator.calls.length = 0;
    controller.scrubStep(0.25);
    expect(animator.calls).toEqual(["seek:1->2@0.25"]);
    const state = controller.getState();
    expect(state.stepProgress).toBe(0.25);
    expect(state.frameIndex).toBe(2);
    expect(state.transitioning).toBe(false);
  });

  it("has nothing to scrub at the crease pattern", () => {
    animator.calls.length = 0;
    controller.scrubStep(0.5);
    expect(animator.calls).toEqual([]);
    expect(controller.getState().stepProgress).toBe(1);
  });

  it("tells the scene to redraw after a scrub, once", () => {
    controller.next();
    controller.tick(1 / 60);
    controller.tick(1 / 60);
    controller.scrubStep(0.5);
    expect(controller.tick(1 / 60)).toBe(true);
    expect(controller.tick(1 / 60)).toBe(false);
  });

  it("keeps the animator settling after a scrub until it says it is done", () => {
    // A solver may not have converged within one move of the slider; it carries on, frame by
    // frame, rather than leaving the model part-way or snapping it.
    controller.next();
    controller.tick(1 / 60);
    controller.tick(1 / 60);
    controller.scrubStep(0.5);
    animator.stepsRemaining = 3;
    const redraws = [1, 2, 3, 4, 5].map(() => controller.tick(1 / 60));
    expect(redraws).toEqual([true, true, true, false, false]);
    expect(controller.getState().transitioning).toBe(false);
  });

  it("takes the stacking order from whichever end of the step the paper is nearer", () => {
    // Sheets lying on each other only matter near either end of a step. At the start of a step
    // they are still in the previous frame's stack, and drawing them in the next frame's order
    // would flash one layer through another.
    const m = model("book-fold-90");
    const place = (frame: number) => controller.positions.set(m.frames[frame]!.coords);
    controller.goTo(1);
    place(0);
    expect(controller.stackingFrame()).toBe(0);
    place(1);
    expect(controller.stackingFrame()).toBe(1);
    controller.tick(1 / 60);
    controller.tick(1 / 60);
    controller.goTo(2);
    controller.scrubStep(0.1);
    place(1);
    expect(controller.stackingFrame()).toBe(1);
    place(2);
    expect(controller.stackingFrame()).toBe(2);
  });

  it("clamps a progress outside the step", () => {
    controller.next();
    controller.scrubStep(-5);
    expect(controller.getState().stepProgress).toBe(0);
    controller.scrubStep(99);
    expect(controller.getState().stepProgress).toBe(1);
  });

  it("keeps the step's creases highlighted while scrubbing it", () => {
    controller.next();
    controller.scrubStep(0.3);
    expect(controller.getState().activeEdges).toEqual([6]);
  });

  it("stops an animation in progress when scrubbed", () => {
    controller.goTo(2);
    expect(controller.getState().transitioning).toBe(true);
    controller.scrubStep(0.5);
    expect(controller.getState().transitioning).toBe(false);
    expect(controller.tick(1 / 60)).toBe(true);
    expect(controller.tick(1 / 60)).toBe(false);
  });

  it("puts the slider at the end of the step after moving to one", () => {
    controller.next();
    expect(controller.getState().stepProgress).toBe(1);
    controller.scrubStep(0.2);
    controller.next();
    expect(controller.getState().stepProgress).toBe(1);
  });

  it("disposes the animator", () => {
    controller.dispose();
    expect(animator.calls).toContain("dispose");
  });

  it("works for a model with many frames and creases", () => {
    const controller4 = new ViewerController(model("preliminary-base"), new FakeAnimator());
    expect(controller4.getState().frameCount).toBe(4);
    controller4.goTo(3);
    expect(controller4.getState().activeEdges).toEqual([8, 9, 10, 11]);
  });
});
