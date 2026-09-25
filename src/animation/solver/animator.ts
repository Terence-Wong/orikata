import type { ResolvedModel } from "@/fold";
import { easeInOutCubic } from "../easing";
import { TRANSITION_SECONDS, type FoldAnimator, type TransitionState } from "../types";
import { planSubsteps, SOLVER_BUDGET_MS } from "./budget";
import { applyRotation, applyTransform, kabsch } from "./kabsch";
import { buildSolverModel, denormalise, frameTargets, normalise, type SolverModel } from "./model";
import { Solver } from "./solver";
import { RigidPath } from "../rigidPath";

/**
 * Once the tween is over, keep solving for at most this many iterations before landing: a second's
 * worth at the full rate. Most steps are within tolerance long before; a big flap swinging a long
 * way uses more of it, and what shows is the end of its swing rather than a snap. Counted in work
 * done rather than time passed, so a slow device takes longer to settle but still gets there.
 */
export const SETTLE_SUBSTEPS = 6000;
/** However slow the device, stop settling a step after this long. */
export const SETTLE_MAX_SECONDS = 6;
/** Settling always gets this long, however little the frame budget allows. */
const SETTLE_MIN_SECONDS = 1;
/** How long the solved shape is blended onto the author's stored geometry. */
export const LANDING_SECONDS = 0.15;
/**
 * Milliseconds spent solving on one move of the scrubber, so dragging stays responsive. Whatever is
 * left is solved over the following frames (see `step`), until the model has settled.
 */
export const SCRUB_SLICE_MS = 12;
/** How many iterations the model may keep settling for after the scrubber stops. */
export const SCRUB_SETTLE_SUBSTEPS = 6000;
/** However slow the device, stop settling after a scrub after this long. */
export const SCRUB_SETTLE_MAX_SECONDS = 8;
/**
 * Iterations a move of the scrubber always gets, however little time it has, so a small model
 * settles in the same place on a busy machine as on an idle one.
 */
export const SCRUB_MIN_SUBSTEPS = 400;
/** How often convergence is checked while scrubbing. */
const SCRUB_CHECK_EVERY = 25;
/**
 * How close the scrubber settles, in radians (0.1°). Tighter than a step's landing: the model is
 * held still to be looked at, and reached from either side as the slider moves back and forth,
 * so both approaches should arrive at the same shape.
 */
export const SCRUB_TOLERANCE = (0.1 * Math.PI) / 180;
/** Good enough to stop settling early, in radians (0.5°). */
export const SETTLE_TOLERANCE = (0.5 * Math.PI) / 180;

type Phase = "idle" | "tweening" | "settling" | "landing" | "scrubbing" | "rigid" | "guided";

/**
 * Iterations the solver gets to close up the rigid path when the scrubber lands part-way through a
 * nearly rigid step. Always the same number, so the same slider position gives the same shape.
 */
export const GUIDED_SCRUB_SUBSTEPS = 300;

/** What the solver's state is currently a solution of: a stored frame, or a point in a step. */
type Standing = { frame: number } | { from: number; to: number } | null;

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
 *
 * A step the paper can make rigidly (see `RigidPath`), which is most plain folds, is not solved at
 * all: it is played exactly as rigid folding, so a stack of layers turns as one block and nothing
 * passes through anything. The solver is for the steps that need the paper to bend.
 */
export class SolverAnimator implements FoldAnimator {
  positions: Float32Array = new Float32Array(0);

  /**
   * `budgetMs` is how much of each rendered frame the solver may use. `substepMs` fixes what one
   * iteration is taken to cost instead of timing it, so a test can stand in for a given device
   * without depending on how busy the machine running it is.
   */
  constructor(
    private readonly budgetMs: number = SOLVER_BUDGET_MS,
    private readonly substepMs?: number,
  ) {}

  private model: ResolvedModel | null = null;
  private solverModel: SolverModel | null = null;
  private solver: Solver | null = null;
  /** Each frame's coordinates in the solver's normalised space. */
  private frames: Float64Array[] = [];
  /** Each frame's target angles, one entry per hinge. */
  private frameAngles: Float64Array[] = [];
  /** Rolling estimate of what one solver iteration costs, used to stay inside the frame budget. */
  private msPerSubstep = 0;

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
  private standing: Standing = null;
  private scrubProgress = 0;
  private scrubbed = 0;
  private scrubSubsteps = 0;
  private settleSubsteps = 0;
  private rigidPath: RigidPath | null = null;
  /** The rigid path's positions, in model coordinates. */
  private rigidCoords: Float64Array = new Float64Array(0);
  private rigidProgress = 0;

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
    this.rigidPath = new RigidPath(model);
    this.rigidCoords = new Float64Array(model.vertexCount * 3);
  }

  jumpTo(frame: number): void {
    const coords = this.frames[frame];
    if (!coords || !this.solver) return;
    this.phase = "idle";
    // Targets first, so a crease that is already folded flat resolves to the author's sign.
    this.solver.targets.set(this.frameAngles[frame]!);
    this.solver.setPositions(coords);
    this.standing = { frame };
    this.write(coords);
  }

  beginTransition(from: number, to: number): void {
    if (!this.solver || !this.frames[from] || !this.frames[to]) return;
    // Interrupting a rigid step: hand its state to the solver so the next one carries on from it.
    // (A guided step's solver state is already the live one.)
    if (this.phase === "rigid") this.syncSolver(this.fromFrame, this.toFrame, this.rigidProgress);

    const standing = this.standing;
    const atStart = standing !== null && "frame" in standing && standing.frame === from;
    if (atStart && this.rigidPath!.isNearlyRigid(from, to)) {
      this.fromFrame = from;
      this.toFrame = to;
      this.elapsed = 0;
      this.rigidProgress = 0;
      this.diagnostics = emptyDiagnostics();
      this.standing = null;
      this.phase = this.isRigid(from, to) ? "rigid" : "guided";
      return;
    }

    // Warm start: the tween begins at the live state, not at frame `from`, so interrupting a step
    // part-way through carries on from where it had reached instead of snapping back.
    this.poseFrom.set(this.solver.positions);
    this.anglesFrom.set(this.solver.targets);
    this.fromFrame = from;
    this.toFrame = to;
    this.elapsed = 0;
    this.settled = 0;
    this.settleSubsteps = 0;
    this.landed = 0;
    this.diagnostics = emptyDiagnostics();
    this.standing = null;
    this.phase = "tweening";
  }

  /**
   * Places the model part-way between two frames for the scrubber. The solver is a relaxation, not
   * a recording, so it tracks whatever targets it is given and this works in either direction.
   *
   * Within a step it carries on from where it is, so dragging moves the paper continuously and
   * each position is a small correction to the last. Arriving from elsewhere it starts from the
   * step's first frame. It solves for a slice of time here and leaves the rest to `step`, which
   * keeps going until the model has settled.
   */
  seek(from: number, to: number, progress: number): void {
    const solver = this.solver;
    const start = this.frames[from];
    const end = this.frames[to];
    if (!solver || !start || !end) return;

    const s = Math.min(Math.max(progress, 0), 1);
    const anglesFrom = this.frameAngles[from]!;
    const anglesTo = this.frameAngles[to]!;

    // Land exactly on a stored frame at either end, so scrubbing to a step matches stepping to it.
    if (s === 0 || s === 1) {
      this.jumpTo(s === 0 ? from : to);
      return;
    }

    // A rigid step is placed exactly: nothing to solve, nothing to settle. A nearly rigid one is
    // placed on the rigid path and closed up by the solver, always with the same effort.
    if (this.rigidPath!.isNearlyRigid(from, to)) {
      this.syncSolver(from, to, s);
      if (this.isRigid(from, to)) {
        this.writeModel(this.rigidCoords);
      } else {
        for (let i = 0; i < GUIDED_SCRUB_SUBSTEPS; i++) solver.substep();
        this.seatOnRigidPath();
        this.write(solver.positions);
      }
      this.standing = { from, to };
      this.phase = "idle";
      return;
    }

    const standing = this.standing;
    const inStep =
      standing !== null &&
      ("frame" in standing
        ? standing.frame === from || standing.frame === to
        : standing.from === from && standing.to === to);
    if (!inStep) {
      // Resolve flat creases against the frame's own targets before moving them.
      solver.targets.set(anglesFrom);
      solver.setPositions(start);
    }
    for (let h = 0; h < solver.targets.length; h++) {
      solver.targets[h] = anglesFrom[h]! + s * (anglesTo[h]! - anglesFrom[h]!);
    }
    this.standing = { from, to };
    this.poseFrom.set(start);
    this.toFrame = to;
    this.scrubProgress = s;
    this.scrubbed = 0;
    this.scrubSubsteps = 0;

    const started = performance.now();
    let converged = false;
    for (let i = 1; !converged; i++) {
      solver.substep();
      if (i % SCRUB_CHECK_EVERY !== 0) continue;
      converged = solver.maxAngleError() < SCRUB_TOLERANCE;
      if (i >= SCRUB_MIN_SUBSTEPS && performance.now() - started > SCRUB_SLICE_MS) break;
    }
    this.seatOnto(s);
    this.phase = converged ? "idle" : "scrubbing";
    this.write(solver.positions);
  }

  step(dtSeconds: number): TransitionState {
    const solver = this.solver;
    if (!solver || this.phase === "idle") return "idle";

    if (this.phase === "scrubbing") {
      this.scrubbed += dtSeconds;
      this.scrubSubsteps += this.runSubsteps(dtSeconds);
      this.seatOnto(this.scrubProgress);
      this.write(solver.positions);
      const working = worthSettling(
        this.scrubbed,
        this.scrubSubsteps,
        SCRUB_SETTLE_SUBSTEPS,
        SCRUB_SETTLE_MAX_SECONDS,
      );
      if (solver.maxAngleError() > SCRUB_TOLERANCE && working) return "running";
      this.phase = "idle";
      return "idle";
    }

    if (this.phase === "landing") return this.stepLanding(dtSeconds);

    if (this.phase === "rigid" || this.phase === "guided") {
      this.elapsed += dtSeconds;
      if (this.elapsed >= TRANSITION_SECONDS) {
        this.jumpTo(this.toFrame);
        return "idle";
      }
      this.rigidProgress = easeInOutCubic(this.elapsed / TRANSITION_SECONDS);
      if (this.phase === "rigid") {
        this.rigidPath!.place(this.fromFrame, this.toFrame, this.rigidProgress, this.rigidCoords);
        this.writeModel(this.rigidCoords);
      } else {
        // Start each frame from the rigid path, which keeps clear of paper passing through paper,
        // and let the solver close the small gaps it leaves between faces.
        this.syncSolver(this.fromFrame, this.toFrame, this.rigidProgress);
        this.runSubsteps(dtSeconds);
        this.seatOnRigidPath();
        this.write(solver.positions);
      }
      return "running";
    }

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
    this.settleSubsteps += this.runSubsteps(dtSeconds);
    this.seatOnto(1);
    this.write(solver.positions);
    const residual = solver.maxAngleError();
    const working = worthSettling(
      this.settled,
      this.settleSubsteps,
      SETTLE_SUBSTEPS,
      SETTLE_MAX_SECONDS,
    );
    if (residual > SETTLE_TOLERANCE && working) return "landing";

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
    this.rigidPath = null;
    this.phase = "idle";
  }

  private isRigid(from: number, to: number): boolean {
    return this.rigidPath?.isRigid(from, to) ?? false;
  }

  /**
   * Puts the solver where the rigid path has the paper, `s` of the way through the step, so a
   * step it solves next starts from what is on screen.
   */
  private syncSolver(from: number, to: number, s: number): void {
    const solver = this.solver;
    const solverModel = this.solverModel;
    if (!solver || !solverModel) return;
    this.rigidPath!.place(from, to, s, this.rigidCoords);
    const anglesFrom = this.frameAngles[from]!;
    const anglesTo = this.frameAngles[to]!;
    for (let h = 0; h < solver.targets.length; h++) {
      solver.targets[h] = anglesFrom[h]! + s * (anglesTo[h]! - anglesFrom[h]!);
    }
    solver.setPositions(normalise(this.rigidCoords, solverModel.scale, solverModel.offset));
  }

  /**
   * Removes any drift of the whole model the solver introduced, by fitting its shape onto the
   * rigid path's (left in `rigidCoords` by `syncSolver`).
   */
  private seatOnRigidPath(): void {
    const solver = this.solver!;
    const solverModel = this.solverModel!;
    const reference = normalise(this.rigidCoords, solverModel.scale, solverModel.offset);
    const transform = kabsch(solver.positions, reference);
    applyTransform(transform, solver.positions);
    applyRotation(transform.rotation, solver.velocities);
  }

  /** Writes positions already in model coordinates. */
  private writeModel(coords: Float64Array): void {
    for (let i = 0; i < coords.length; i++) this.positions[i] = coords[i]!;
  }

  private stepLanding(dtSeconds: number): TransitionState {
    const solver = this.solver!;
    const target = this.frames[this.toFrame]!;
    this.landed += dtSeconds;
    const u = Math.min(this.landed / LANDING_SECONDS, 1);
    if (u >= 1) {
      solver.targets.set(this.frameAngles[this.toFrame]!);
      solver.setPositions(target);
      this.standing = { frame: this.toFrame };
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

  /**
   * Runs as many iterations as the frame can afford. A model too big for the full rate gets fewer,
   * so it loses accuracy rather than frame rate; the landing blend still puts it exactly on the
   * author's geometry at the end of the step.
   */
  private runSubsteps(dtSeconds: number): number {
    const solver = this.solver!;
    const count = planSubsteps(dtSeconds, this.substepMs ?? this.msPerSubstep, this.budgetMs);
    const started = performance.now();
    for (let i = 0; i < count; i++) solver.substep();
    if (this.substepMs !== undefined) return count;
    const each = (performance.now() - started) / count;
    // Smoothed, so one slow frame does not starve the next.
    this.msPerSubstep = this.msPerSubstep === 0 ? each : this.msPerSubstep * 0.8 + each * 0.2;
    return count;
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

/**
 * Whether to keep settling. A slow device keeps going until the iteration count is reached,
 * because it will get there; a model too big for its frame budget, which would take far longer
 * than the backstop at the rate it is going, stops after a second and lets the landing blend
 * finish the step.
 */
function worthSettling(
  elapsed: number,
  substeps: number,
  enough: number,
  backstop: number,
): boolean {
  if (substeps >= enough || elapsed >= backstop) return false;
  if (elapsed < SETTLE_MIN_SECONDS) return true;
  const projected = (elapsed * enough) / Math.max(substeps, 1);
  return projected <= backstop;
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
