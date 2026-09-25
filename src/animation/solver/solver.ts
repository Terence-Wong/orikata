import { cornerAngle, cornerGradient } from "./corner";
import { hingeAngle, hingeGradient } from "./hinge";
import { DAMPING_RATIO, FACE_STIFFNESS, type SolverModel } from "./model";

/** Shortest signed rotation from `previous` to `angle`, in (−π, π]. */
function shortestDelta(angle: number, previous: number): number {
  let delta = (angle - previous) % (2 * Math.PI);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  else if (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}

/**
 * Constraint-based thin-shell solver: a CPU TypeScript port of the model in Amanda Ghassaei's
 * Origami Simulator (MIT), described in "Fast, Interactive Origami Simulation using GPU
 * Computation" (Ghassaei, Demaine, Gershenfeld, 7OSME 2018). Axial springs hold edge lengths,
 * torsional springs drive each crease towards a target angle, and face angle springs resist
 * shearing. Integration is semi-implicit Euler. Damping sits on the axial springs, acting on the
 * difference in velocity of the two vertices each joins, as in the original: it slows the paper
 * moving against itself but not the paper moving through space, so a large flap swinging on its
 * crease is not held back by how finely it happens to be divided.
 *
 * Positions and velocities are in the model's normalised space; the caller converts.
 */
export class Solver {
  readonly positions: Float64Array;
  readonly velocities: Float64Array;
  /** Target fold angle per hinge, in radians. */
  readonly targets: Float64Array;

  private readonly forces: Float64Array;
  /** Damping coefficient of each axial spring. */
  private readonly damping: Float64Array;
  /**
   * Fold angles accumulated across the ±π boundary. A measured angle cannot tell a crease folded to
   * +180° from one folded to −180°, which are mirror images, and it jumps by a full turn when a
   * crease is pushed past flat. Following each crease continuously from where it started keeps the
   * springs pulling towards the fold the author asked for.
   */
  private readonly continuous: Float64Array;
  private readonly measured: Float64Array;
  private readonly hingeGrad = new Float64Array(12);
  private readonly cornerGrad = new Float64Array(9);

  constructor(private readonly model: SolverModel) {
    this.positions = new Float64Array(model.vertexCount * 3);
    this.velocities = new Float64Array(model.vertexCount * 3);
    this.forces = new Float64Array(model.vertexCount * 3);
    this.targets = new Float64Array(model.hinges.length);
    this.continuous = new Float64Array(model.hinges.length);
    this.measured = new Float64Array(model.hinges.length);
    // Critical damping for a unit mass is 2√k; the ratio scales that.
    this.damping = Float64Array.from(model.axial, ({ k }) => DAMPING_RATIO * 2 * Math.sqrt(k));
  }

  /**
   * Places the solver at a configuration and stops all motion. Set the targets first: a crease that
   * is already folded flat measures as +180° or −180° depending on rounding, and the current target
   * is what says which of the two the author meant.
   */
  setPositions(coords: Float64Array): void {
    this.positions.set(coords);
    this.velocities.fill(0);
    this.resetAngles();
  }

  /** Re-reads every crease angle, resolving each one to the turn nearest its target. */
  resetAngles(): void {
    this.model.hinges.forEach((hinge, i) => {
      const angle = hingeAngle(this.positions, hinge.nodes);
      this.measured[i] = angle;
      const target = this.targets[i]!;
      this.continuous[i] = target + shortestDelta(angle, target);
    });
  }

  /** Continuous fold angle of each crease, in radians. */
  angles(): Float64Array {
    return this.continuous;
  }

  /** Advances one internal timestep. */
  substep(): void {
    this.trackAngles();
    this.accumulateForces();
    const { dt } = this.model;
    for (let i = 0; i < this.positions.length; i++) {
      const velocity = this.velocities[i]! + this.forces[i]! * dt;
      this.velocities[i] = velocity;
      this.positions[i] = this.positions[i]! + velocity * dt;
    }
  }

  /** Largest distance from any crease to its target angle, in radians. */
  maxAngleError(): number {
    this.trackAngles();
    let worst = 0;
    for (let i = 0; i < this.continuous.length; i++) {
      worst = Math.max(worst, Math.abs(this.continuous[i]! - this.targets[i]!));
    }
    return worst;
  }

  private trackAngles(): void {
    this.model.hinges.forEach((hinge, i) => {
      const angle = hingeAngle(this.positions, hinge.nodes);
      this.continuous[i] = this.continuous[i]! + shortestDelta(angle, this.measured[i]!);
      this.measured[i] = angle;
    });
  }

  /** Largest relative stretch or compression of any axial spring. */
  maxEdgeStrain(): number {
    let worst = 0;
    for (const spring of this.model.axial) {
      if (spring.restLength === 0) continue;
      const length = this.distance(spring.a, spring.b);
      worst = Math.max(worst, Math.abs(length - spring.restLength) / spring.restLength);
    }
    return worst;
  }

  private accumulateForces(): void {
    this.forces.fill(0);

    this.model.axial.forEach((spring, s) => {
      const a = 3 * spring.a;
      const b = 3 * spring.b;
      const c = this.damping[s]!;
      for (let axis = 0; axis < 3; axis++) {
        const pull = c * (this.velocities[b + axis]! - this.velocities[a + axis]!);
        this.forces[a + axis] = this.forces[a + axis]! + pull;
        this.forces[b + axis] = this.forces[b + axis]! - pull;
      }
      const dx = this.positions[b]! - this.positions[a]!;
      const dy = this.positions[b + 1]! - this.positions[a + 1]!;
      const dz = this.positions[b + 2]! - this.positions[a + 2]!;
      const length = Math.hypot(dx, dy, dz);
      if (length === 0) return;
      const magnitude = (spring.k * (length - spring.restLength)) / length;
      this.forces[a] = this.forces[a]! + magnitude * dx;
      this.forces[a + 1] = this.forces[a + 1]! + magnitude * dy;
      this.forces[a + 2] = this.forces[a + 2]! + magnitude * dz;
      this.forces[b] = this.forces[b]! - magnitude * dx;
      this.forces[b + 1] = this.forces[b + 1]! - magnitude * dy;
      this.forces[b + 2] = this.forces[b + 2]! - magnitude * dz;
    });

    this.model.hinges.forEach((hinge, i) => {
      const error = this.continuous[i]! - this.targets[i]!;
      if (error === 0) return;
      hingeGradient(this.positions, hinge.nodes, this.hingeGrad);
      const scale = -hinge.k * error;
      const nodes = [hinge.nodes.a, hinge.nodes.b, hinge.nodes.c, hinge.nodes.d];
      for (let n = 0; n < 4; n++) {
        const base = 3 * nodes[n]!;
        for (let axis = 0; axis < 3; axis++) {
          this.forces[base + axis] =
            this.forces[base + axis]! + scale * this.hingeGrad[3 * n + axis]!;
        }
      }
    });

    for (const corner of this.model.corners) {
      const error = cornerAngle(this.positions, corner) - corner.restAngle;
      if (error === 0) continue;
      cornerGradient(this.positions, corner, this.cornerGrad);
      const scale = -FACE_STIFFNESS * error;
      const nodes = [corner.a, corner.b, corner.c];
      for (let n = 0; n < 3; n++) {
        const base = 3 * nodes[n]!;
        for (let axis = 0; axis < 3; axis++) {
          this.forces[base + axis] =
            this.forces[base + axis]! + scale * this.cornerGrad[3 * n + axis]!;
        }
      }
    }
  }

  private distance(a: number, b: number): number {
    return Math.hypot(
      this.positions[3 * a]! - this.positions[3 * b]!,
      this.positions[3 * a + 1]! - this.positions[3 * b + 1]!,
      this.positions[3 * a + 2]! - this.positions[3 * b + 2]!,
    );
  }
}
