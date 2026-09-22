import type { ResolvedModel } from "@/fold";
import { easeInOutCubic } from "../easing";
import { TRANSITION_SECONDS, type FoldAnimator, type TransitionState } from "../types";
import { applyRotation, applyTransform, kabsch } from "./kabsch";
import { buildSolverModel, denormalise, frameTargets, normalise, type SolverModel } from "./model";
import { Solver } from "./solver";

/** Solver iterations per second of animation; a rendered frame gets its share of these. */
export const SUBSTEPS_PER_SECOND = 1500;
/** Never spend more than this many iterations on one rendered frame, however long it was. */
export const MAX_SUBSTEPS_PER_FRAME = 120;
/** Once the tween is over, keep solving for at most this long before landing. */
export const SETTLE_SECONDS = 0.4;
/** How long the solved shape is blended onto the author's stored geometry. */
export const LANDING_SECONDS = 0.15;
/** Good enough to stop settling early, in radians (0.5°). */
export const SETTLE_TOLERANCE = (0.5 * Math.PI) / 180;

type Phase = "idle" | "tweening" | "settling" | "landing";

/** What the last transition cost, for the prototype comparison. */
export interface TransitionDiagnostics {
  /** How far the worst crease was from its target when the tween ended, in degrees. */
  residualAtTweenEndDeg: number;
  /** How far it still was when the solver stopped settling, in degrees. */
  residualAtLandingDeg: number;
  /** Rendered frames spent settling after the tween. */
  settleFrames: number;
  /** How far any vertex has to move during the landing blend, in model units. */
  landingDistance: number;
}

/**
 * Prototype B: tween each crease's target fold angle from one frame to the next and let the
 * constraint solver track it, warm-started from the current state. The solved shape is re-seated
 * onto the pose the author intended, then blended onto their stored geometry so every step lands
 * exactly where they put it.
 */
export class SolverAnimator implements FoldAnimator {
  positions: Float32Array = new Float32Array(0);

  private model: ResolvedModel | null = null;
  private solverModel: SolverModel | null = null;
  private solver: Solver | null = null;
  /** Each frame's coordinates in the solver's normalised space. */
  private frames: Float64Array[] = [];
  /** Each frame's target angles, one entry per hinge. */
  private frameAngles: Float64Array[] = [];

  private phase: Phase = "idle";
  private fromFrame = 0;
  private toFrame = 0;
  private elapsed = 0;
  private settled = 0;
  private landed = 0;
  private reference: Float64Array = new Float64Array(0);
  private landingStart: Float64Array = new Float64Array(0);
  /** Where the current transition started: the live state, not necessarily a stored frame. */
  private poseFrom: Float64Array = new Float64Array(0);
  private anglesFrom: Float64Array = new Float64Array(0);
  private diagnostics: TransitionDiagnostics = emptyDiagnostics();

  init(model: ResolvedModel, out: Float32Array): void {
    this.positions = out;
    this.model = model;
    const solverModel = buildSolverModel(model);
    this.solverModel = solverModel;
    this.solver = new Solver(solverModel);
    this.frames = model.frames.map((frame) =>
      normalise(frame.coords, solverModel.scale, solverModel.offset),
    );
    this.frameAngles = model.frames.map((_, index) => frameTargets(model, solverModel, index));
    this.reference = new Float64Array(model.vertexCount * 3);
    this.landingStart = new Float64Array(model.vertexCount * 3);
    this.poseFrom = new Float64Array(model.vertexCount * 3);
    this.anglesFrom = new Float64Array(solverModel.hinges.length);
  }

  jumpTo(frame: number): void {
    const coords = this.frames[frame];
    if (!coords || !this.solver) return;
    this.phase = "idle";
    // Targets first, so a crease that is already folded flat resolves to the author's sign.
    this.solver.targets.set(this.frameAngles[frame]!);
    this.solver.setPositions(coords);
    this.write(coords);
  }

  beginTransition(from: number, to: number): void {
    if (!this.solver || !this.frames[from] || !this.frames[to]) return;
    // Warm start: the tween begins at the live state, not at frame `from`, so interrupting a step
    // part-way through carries on from where it had reached instead of snapping back.
    this.poseFrom.set(this.solver.positions);
    this.anglesFrom.set(this.solver.targets);
    this.fromFrame = from;
    this.toFrame = to;
    this.elapsed = 0;
    this.settled = 0;
    this.landed = 0;
    this.diagnostics = emptyDiagnostics();
    this.phase = "tweening";
  }

  step(dtSeconds: number): TransitionState {
    const solver = this.solver;
    if (!solver || this.phase === "idle") return "idle";

    if (this.phase === "landing") return this.stepLanding(dtSeconds);

    if (this.phase === "tweening") {
      this.elapsed += dtSeconds;
      const s = easeInOutCubic(Math.min(this.elapsed / TRANSITION_SECONDS, 1));
      const from = this.anglesFrom;
      const to = this.frameAngles[this.toFrame]!;
      for (let h = 0; h < solver.targets.length; h++) {
        solver.targets[h] = from[h]! + s * (to[h]! - from[h]!);
      }
      this.runSubsteps(dtSeconds);
      this.seatOnto(s);
      this.write(solver.positions);
      if (this.elapsed < TRANSITION_SECONDS) return "running";
      this.diagnostics.residualAtTweenEndDeg = toDegrees(solver.maxAngleError());
      this.phase = "settling";
      return "running";
    }

    // Settling: the targets are final, so let the shape catch up before it is handed over.
    this.settled += dtSeconds;
    this.diagnostics.settleFrames += 1;
    this.runSubsteps(dtSeconds);
    this.seatOnto(1);
    this.write(solver.positions);
    const residual = solver.maxAngleError();
    if (residual > SETTLE_TOLERANCE && this.settled < SETTLE_SECONDS) return "landing";

    this.diagnostics.residualAtLandingDeg = toDegrees(residual);
    this.landingStart.set(solver.positions);
    const target = this.frames[this.toFrame]!;
    let distance = 0;
    for (let i = 0; i < target.length; i += 3) {
      distance = Math.max(
        distance,
        Math.hypot(
          this.landingStart[i]! - target[i]!,
          this.landingStart[i + 1]! - target[i + 1]!,
          this.landingStart[i + 2]! - target[i + 2]!,
        ),
      );
    }
    // Report in model units rather than the solver's normalised space.
    this.diagnostics.landingDistance = distance / (this.solverModel?.scale ?? 1);
    this.phase = "landing";
    return "landing";
  }

  /** What the last transition cost. Only meaningful once it has finished. */
  lastTransition(): TransitionDiagnostics {
    return this.diagnostics;
  }

  dispose(): void {
    this.model = null;
    this.solverModel = null;
    this.solver = null;
    this.frames = [];
    this.frameAngles = [];
    this.phase = "idle";
  }

  private stepLanding(dtSeconds: number): TransitionState {
    const solver = this.solver!;
    const target = this.frames[this.toFrame]!;
    this.landed += dtSeconds;
    const u = Math.min(this.landed / LANDING_SECONDS, 1);
    if (u >= 1) {
      solver.targets.set(this.frameAngles[this.toFrame]!);
      solver.setPositions(target);
      this.phase = "idle";
      this.write(target);
      return "idle";
    }
    for (let i = 0; i < this.reference.length; i++) {
      const start = this.landingStart[i]!;
      this.reference[i] = start + u * (target[i]! - start);
    }
    this.write(this.reference);
    return "landing";
  }

  private runSubsteps(dtSeconds: number): void {
    const solver = this.solver!;
    const count = Math.min(
      MAX_SUBSTEPS_PER_FRAME,
      Math.max(1, Math.round(dtSeconds * SUBSTEPS_PER_SECOND)),
    );
    for (let i = 0; i < count; i++) solver.substep();
  }

  /**
   * The solver is free to drift and to spin the whole model, because every force in it is internal.
   * Fitting its state onto the straight-line blend of the two stored frames keeps the model where
   * the author put it, and leaves only shape error for the landing blend to absorb.
   */
  private seatOnto(s: number): void {
    const solver = this.solver!;
    const from = this.poseFrom;
    const to = this.frames[this.toFrame]!;
    for (let i = 0; i < this.reference.length; i++) {
      const a = from[i]!;
      this.reference[i] = a + s * (to[i]! - a);
    }
    const transform = kabsch(solver.positions, this.reference);
    applyTransform(transform, solver.positions);
    applyRotation(transform.rotation, solver.velocities);
  }

  private write(normalised: Float64Array): void {
    const solverModel = this.solverModel;
    if (!solverModel) return;
    denormalise(normalised, solverModel.scale, solverModel.offset, this.positions);
  }
}

function emptyDiagnostics(): TransitionDiagnostics {
  return {
    residualAtTweenEndDeg: 0,
    residualAtLandingDeg: 0,
    settleFrames: 0,
    landingDistance: 0,
  };
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
