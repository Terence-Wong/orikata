/**
 * Writes a multi-frame FOLD model from a list of folding steps, the way diagrams describe them:
 * "fold this flap along this line". Used by `build-fixtures.ts` for the models that have no closed
 * form, such as the crane.
 *
 * The sheet is a set of convex faces, each carrying the rigid motion that takes it from the crease
 * pattern to where it lies now. A fold names a line in the folded model and the layers that move;
 * the faces those layers cross are cut along the line, and the pieces on the moving side rotate
 * about it. Cutting a convex face by a line leaves convex faces, so the crease pattern builds
 * itself as the steps go.
 *
 * Nothing here guarantees the result is a real fold. `build` checks that every vertex lands in the
 * same place from every face that holds it (the sheet does not tear), and the fixture tests check
 * the rest. What this code does decide is mountain versus valley on a flat crease, which geometry
 * cannot see. A crease with one side turning lies on the fold line, so nudging that side a small
 * angle the way it turns gives the letter. A crease whose two sides turn opposite ways is the spine
 * of a reverse fold, and changes over. Collapses placed directly take their letters from the step.
 */
import type { Assignment } from "@/fold";
import { rigidInBetweens } from "./rigid-in-between";

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

/** A proper rigid motion, world = r·p + t, with r row-major. */
export interface Motion {
  r: readonly number[];
  t: Vec3;
}

export interface FaceInfo {
  /** Centroid in the crease pattern. */
  cp: Vec2;
  /** Centroid where the face lies now. */
  world: Vec3;
  tags: ReadonlySet<string>;
}

export type Layers = (face: FaceInfo) => boolean;

export interface FoldGroup {
  layers: Layers;
  /** Degrees. Positive lifts the moving side towards the viewer (+z), negative takes it behind. */
  angle: number;
  /** Added to every piece this group moves, so a later step can pick them out. */
  tag?: string;
}

export type Operation =
  | {
      kind: "fold";
      /** Two points on the fold line, in the folded model's plane (z = 0). */
      line: readonly [Vec2, Vec2];
      /** A point on the side of the line that moves. */
      side: Vec2;
      groups: FoldGroup[];
    }
  | {
      /** Cut the chosen layers along a line without moving anything: a precrease. */
      kind: "crease";
      line: readonly [Vec2, Vec2];
      layers: Layers;
      /** Tag the pieces on one side of the line. */
      tag?: { side: Vec2; name: string };
    }
  | {
      /**
       * Move whole faces to explicit positions, for collapses such as a petal fold that are not a
       * rotation about one line. Such a move carries no direction to read mountain and valley
       * from, so any crease it folds flat needs `signs` on the step.
       */
      kind: "place";
      groups: Array<{
        layers: Layers;
        /** A motion applied on top of where the face is now, or where it was after step `from`. */
        then?: Motion;
        /** The name of an earlier step whose result `then` applies to. */
        from?: string;
        set?: (face: FaceInfo) => Motion;
      }>;
    };

export interface Step {
  title: string;
  /** A name later steps can refer to, for moves measured from this step's result. */
  name?: string;
  description?: string;
  operations: Operation[];
  /** Mountain or valley for creases this step folds flat, by their midpoint in the crease pattern. */
  signs?: (midpoint: Vec2) => "M" | "V" | undefined;
  /**
   * Rigid states part-way through the step, each shown as a frame of its own before the step's
   * own, found by `rigid-in-between.ts`: for a move that is not one fold about one line, like a
   * squash or a petal fold, so the animation has the paper's real path to follow. `at` is how far
   * the driving crease has turned, as a fraction of its whole turn in the step.
   */
  inBetween?: Array<{ at: number; title: string; description?: string }>;
  /** A point in the crease pattern on the crease that drives the in-between states. */
  driver?: Vec2;
}

export interface SequenceOutput {
  vertices: [number, number, number][];
  edges: [number, number][];
  assignments: Assignment[];
  faces: number[][];
  frames: Array<{
    title: string;
    description?: string;
    vertices: [number, number, number][];
    assignments: Assignment[];
  }>;
}

interface Face {
  polygon: number[];
  tags: Set<string>;
  /** Motion after each operation; index 0 is the flat sheet. */
  history: Motion[];
  /** The nudged motion for each operation, when that operation was a fold. */
  probes: Array<Motion | undefined>;
  /** For each fold, which group moved this face and which way: ±(group + 1), or 0. */
  turns: number[];
}

const EPSILON = 1e-9;
const PROBE_RADIANS = 1e-3;
const FLAT_DEGREES = 1e-6;

export const IDENTITY: Motion = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

export function apply(m: Motion, p: Vec3): Vec3 {
  const { r, t } = m;
  return [
    r[0]! * p[0] + r[1]! * p[1] + r[2]! * p[2] + t[0],
    r[3]! * p[0] + r[4]! * p[1] + r[5]! * p[2] + t[1],
    r[6]! * p[0] + r[7]! * p[1] + r[8]! * p[2] + t[2],
  ];
}

/** `outer ∘ inner`: apply `inner` first. */
export function compose(outer: Motion, inner: Motion): Motion {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += outer.r[3 * i + k]! * inner.r[3 * k + j]!;
      r.push(sum);
    }
  }
  return { r, t: apply(outer, inner.t) };
}

export function invertMotion(m: Motion): Motion {
  const { r } = m;
  const rt = [r[0]!, r[3]!, r[6]!, r[1]!, r[4]!, r[7]!, r[2]!, r[5]!, r[8]!];
  const t = apply({ r: rt, t: [0, 0, 0] }, m.t);
  return { r: rt, t: [-t[0], -t[1], -t[2]] };
}

/** Rotation by `radians` about the axis through `point` along the unit vector `axis`. */
export function rotationAbout(point: Vec3, axis: Vec3, radians: number): Motion {
  const [x, y, z] = axis;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const v = 1 - c;
  const r = [
    c + x * x * v,
    x * y * v - z * s,
    x * z * v + y * s,
    y * x * v + z * s,
    c + y * y * v,
    y * z * v - x * s,
    z * x * v - y * s,
    z * y * v + x * s,
    c + z * z * v,
  ];
  const moved = apply({ r, t: [0, 0, 0] }, point);
  return { r, t: [point[0] - moved[0], point[1] - moved[1], point[2] - moved[2]] };
}

/**
 * The rotation a fold makes: about a line in the plane z = 0, by `degrees`, with positive lifting
 * the `side` of the line towards the viewer (+z).
 */
export function turnAbout(line: readonly [Vec2, Vec2], side: Vec2, degrees: number): Motion {
  const [a, b] = line;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let axis: Vec3 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length, 0];
  const lift = axis[0] * (side[1] - a[1]) - axis[1] * (side[0] - a[0]);
  if (lift < 0) axis = [-axis[0], -axis[1], 0];
  return rotationAbout([a[0], a[1], 0], axis, (degrees * Math.PI) / 180);
}

/** The half-turn about a line in the plane: a flat fold along it. */
export function foldAcross(a: Vec2, b: Vec2): Motion {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return rotationAbout(
    [a[0], a[1], 0],
    [(b[0] - a[0]) / length, (b[1] - a[1]) / length, 0],
    Math.PI,
  );
}

/** The motion taking a crease-pattern triangle onto three points in space, which must be congruent. */
export function motionFromTriangle(
  cp: readonly [Vec2, Vec2, Vec2],
  world: readonly [Vec3, Vec3, Vec3],
): Motion {
  const c1 = [cp[1][0] - cp[0][0], cp[1][1] - cp[0][1]] as const;
  const c2 = [cp[2][0] - cp[0][0], cp[2][1] - cp[0][1]] as const;
  const w1 = sub(world[1], world[0]);
  const w2 = sub(world[2], world[0]);
  // Solve L·c1 = w1, L·c2 = w2 for the 3×2 linear part L.
  const det = c1[0] * c2[1] - c2[0] * c1[1];
  const ex: Vec3 = scale(sub(scale(w1, c2[1]), scale(w2, c1[1])), 1 / det);
  const ey: Vec3 = scale(sub(scale(w2, c1[0]), scale(w1, c2[0])), 1 / det);
  const ez = cross(ex, ey);
  if (
    Math.abs(dot(ex, ex) - 1) > 1e-9 ||
    Math.abs(dot(ey, ey) - 1) > 1e-9 ||
    Math.abs(dot(ex, ey)) > 1e-9
  ) {
    throw new Error("motionFromTriangle: the triangles are not congruent");
  }
  const r = [ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]];
  const origin = apply({ r, t: [0, 0, 0] }, [cp[0][0], cp[0][1], 0]);
  return { r, t: sub(world[0], origin) };
}

export class FoldingSequence {
  private readonly points: [number, number][] = [];
  private faces: Face[];
  private readonly steps: Array<{
    title: string;
    description?: string;
    lastOperation: number;
    firstOperation: number;
    name?: string;
    signs?: Step["signs"];
  }> = [];
  private operationCount = 0;

  /** `outline` is the sheet, counter-clockwise. */
  constructor(outline: Vec2[]) {
    this.faces = [
      {
        polygon: outline.map((p) => this.point(p)),
        tags: new Set(),
        history: [IDENTITY],
        probes: [undefined],
        turns: [0],
      },
    ];
  }

  step(step: Step): this {
    const firstOperation = this.operationCount + 1;
    for (const operation of step.operations) this.run(operation);
    if (step.inBetween?.length) return this.withInBetweens(step, firstOperation - 1);
    this.steps.push({
      title: step.title,
      description: step.description,
      firstOperation,
      lastOperation: this.operationCount,
      name: step.name,
      signs: step.signs,
    });
    return this;
  }

  /**
   * Replaces the step's operations with its in-between states and then its end state, each a frame
   * of its own. The operations have already cut the faces and placed them at the end; the states
   * between come from `rigidInBetweens`, fitted face by face.
   */
  private withInBetweens(step: Step, before: number): this {
    if (!step.driver) throw new Error(`${this.where()}: in-between states need a driving crease`);
    const used = new Set(this.faces.flatMap((face) => face.polygon));
    const ids = [...used];
    const index = new Map(ids.map((id, i) => [id, i]));
    const polygons = this.faces.map((face) =>
      this.withSideVertices(face.polygon, used).map((id) => index.get(id)!),
    );
    const flatOf = (id: number): Vec3 => [this.points[id]![0], this.points[id]![1], 0];
    const placeAll = (motion: (face: Face) => Motion) => {
      const placed: Vec3[] = new Array(ids.length);
      this.faces.forEach((face, f) => {
        for (const v of polygons[f]!) placed[v] ??= apply(motion(face), flatOf(ids[v]!));
      });
      return placed;
    };
    const start = placeAll((face) => face.history[before]!);
    const end = placeAll((face) => this.current(face));
    const moving = this.faces.map((face) => !sameMotion(face.history[before]!, this.current(face)));

    // The two faces either side of the driving crease: the sides of theirs it lies on.
    const [dx, dy] = step.driver;
    const onSide = (f: number) =>
      polygons[f]!.some((u, i) => {
        const v = polygons[f]![(i + 1) % polygons[f]!.length]!;
        const [ux, uy] = this.points[ids[u]!]!;
        const [vx, vy] = this.points[ids[v]!]!;
        const length = Math.hypot(vx - ux, vy - uy);
        const across = Math.abs((vx - ux) * (dy - uy) - (vy - uy) * (dx - ux)) / length;
        const along = ((dx - ux) * (vx - ux) + (dy - uy) * (vy - uy)) / (length * length);
        return across < 1e-9 && along > 0 && along < 1;
      });
    const sides = this.faces.map((_, f) => f).filter(onSide);
    if (sides.length !== 2) {
      throw new Error(`${this.where()}: the driving crease has ${sides.length} faces, not two`);
    }

    const fractions = step.inBetween!.map(({ at }) => at);
    const states = rigidInBetweens({
      flat: ids.map(flatOf),
      faces: polygons,
      start,
      end,
      moving,
      driver: [sides[0]!, sides[1]!],
      fractions,
      where: `${this.where()} "${step.title}"`,
    });

    // Rewrite the step's history: each in-between state, then the end state.
    const ends = this.faces.map((face) => this.current(face));
    for (const face of this.faces) {
      face.history.length = before + 1;
      face.probes.length = before + 1;
      face.turns.length = before + 1;
    }
    this.operationCount = before;
    const record = (motionOf: (face: Face, f: number) => Motion) => {
      this.operationCount++;
      this.faces.forEach((face, f) => {
        face.history.push(motionOf(face, f));
        face.probes.push(undefined);
        face.turns.push(0);
      });
    };
    step.inBetween!.forEach((frame, k) => {
      const state = states[k]!;
      record((face, f) => {
        if (!moving[f]) return face.history[before]!;
        const [a, b, c] = widestTriangle(polygons[f]!, (v) => flatOf(ids[v]!));
        return motionFromTriangle(
          [
            [flatOf(ids[a]!)[0], flatOf(ids[a]!)[1]],
            [flatOf(ids[b]!)[0], flatOf(ids[b]!)[1]],
            [flatOf(ids[c]!)[0], flatOf(ids[c]!)[1]],
          ],
          [state[a]!, state[b]!, state[c]!],
        );
      });
      this.steps.push({
        title: frame.title,
        description: frame.description,
        firstOperation: this.operationCount,
        lastOperation: this.operationCount,
      });
    });
    record((_, f) => ends[f]!);
    this.steps.push({
      title: step.title,
      description: step.description,
      firstOperation: this.operationCount,
      lastOperation: this.operationCount,
      name: step.name,
      signs: step.signs,
    });
    return this;
  }

  private run(operation: Operation): void {
    this.operationCount++;
    const moves = new Map<Face, { motion: Motion; probe?: Motion; turn?: number }>();

    if (operation.kind === "crease") {
      const chosen = this.faces.filter((face) => operation.layers(this.info(face)));
      this.cut(chosen, operation.line);
      if (operation.tag) {
        const tag = operation.tag;
        for (const face of this.cutPieces) {
          if (this.sideOf(face, operation.line, tag.side) > 0) face.tags.add(tag.name);
        }
      }
    } else if (operation.kind === "fold") {
      operation.groups.forEach((group, g) => {
        const chosen = this.faces.filter((face) => group.layers(this.info(face)));
        this.cut(chosen, operation.line);
        const moving = this.cutPieces.filter(
          (face) => this.sideOf(face, operation.line, operation.side) > 0,
        );
        const turn = turnAbout(operation.line, operation.side, group.angle);
        const nudge = turnAbout(
          operation.line,
          operation.side,
          (Math.sign(group.angle) * PROBE_RADIANS * 180) / Math.PI,
        );
        for (const face of moving) {
          if (moves.has(face))
            throw new Error(`${this.where()}: a face is in two groups of one fold`);
          const current = this.current(face);
          moves.set(face, {
            motion: compose(turn, current),
            probe: compose(nudge, current),
            turn: Math.sign(group.angle) * (g + 1),
          });
          if (group.tag) face.tags.add(group.tag);
        }
        if (moving.length === 0) throw new Error(`${this.where()}: a fold group moves nothing`);
      });
    } else {
      for (const group of operation.groups) {
        const chosen = this.faces.filter((face) => group.layers(this.info(face)));
        if (chosen.length === 0) throw new Error(`${this.where()}: a place group matches nothing`);
        for (const face of chosen) {
          if (moves.has(face)) throw new Error(`${this.where()}: a face is in two place groups`);
          const motion = group.set
            ? group.set(this.info(face))
            : compose(group.then!, group.from ? this.after(face, group.from) : this.current(face));
          moves.set(face, { motion });
        }
      }
    }

    for (const face of this.faces) {
      const move = moves.get(face);
      face.history.push(move ? move.motion : this.current(face));
      face.probes.push(operation.kind === "fold" ? (move?.probe ?? this.current(face)) : undefined);
      face.turns.push(move?.turn ?? 0);
    }
  }

  /** The pieces produced by the last `cut`, including the faces it left whole. */
  private cutPieces: Face[] = [];

  private cut(chosen: Face[], line: readonly [Vec2, Vec2]): void {
    const pieces: Face[] = [];
    const next: Face[] = [];
    for (const face of this.faces) {
      if (!chosen.includes(face)) {
        next.push(face);
        continue;
      }
      const halves = this.split(face, line);
      next.push(...halves);
      pieces.push(...halves);
    }
    this.faces = next;
    this.cutPieces = pieces;
  }

  /** Cuts a face along a line given in world coordinates; returns it whole if the line misses. */
  private split(face: Face, line: readonly [Vec2, Vec2]): Face[] {
    const motion = this.current(face);
    const normal = apply({ r: motion.r, t: [0, 0, 0] }, [0, 0, 1]);
    if (Math.abs(Math.abs(normal[2]) - 1) > 1e-9 || Math.abs(motion.t[2]) > 1e-9) {
      const { cp, tags } = this.info(face);
      throw new Error(
        `${this.where()}: cannot cut a face that is not lying flat (crease pattern centre ` +
          `${cp.map((x) => x.toFixed(3)).join(", ")}, tags ${[...tags].join(", ") || "none"})`,
      );
    }
    const back = invertMotion(motion);
    const p = apply(back, [line[0][0], line[0][1], 0]);
    const q = apply(back, [line[1][0], line[1][1], 0]);
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const scaleBy = 1 / Math.hypot(dx, dy);
    const side = (id: number) => {
      const [x, y] = this.points[id]!;
      const s = (dx * (y - p[1]) - dy * (x - p[0])) * scaleBy;
      return Math.abs(s) < EPSILON ? 0 : s;
    };

    const sides = face.polygon.map(side);
    if (!sides.some((s) => s > 0) || !sides.some((s) => s < 0)) return [face];

    const left: number[] = [];
    const right: number[] = [];
    const n = face.polygon.length;
    for (let i = 0; i < n; i++) {
      const u = face.polygon[i]!;
      const v = face.polygon[(i + 1) % n]!;
      const su = sides[i]!;
      const sv = sides[(i + 1) % n]!;
      if (su >= 0) left.push(u);
      if (su <= 0) right.push(u);
      if ((su > 0 && sv < 0) || (su < 0 && sv > 0)) {
        const t = su / (su - sv);
        const [ux, uy] = this.points[u]!;
        const [vx, vy] = this.points[v]!;
        const w = this.point([ux + t * (vx - ux), uy + t * (vy - uy)]);
        left.push(w);
        right.push(w);
      }
    }
    return [left, right].map((polygon) => ({
      polygon,
      tags: new Set(face.tags),
      history: [...face.history],
      probes: [...face.probes],
      turns: [...face.turns],
    }));
  }

  private sideOf(face: Face, line: readonly [Vec2, Vec2], side: Vec2): number {
    const [a, b] = line;
    const c = this.info(face).world;
    const cross2 = (x: number, y: number) =>
      (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const faceSide = cross2(c[0], c[1]);
    if (Math.abs(faceSide) < EPSILON)
      throw new Error(`${this.where()}: a face's centre lies on a fold line`);
    return Math.sign(faceSide) * Math.sign(cross2(side[0], side[1]));
  }

  /** Where a face was when the named step finished. */
  private after(face: Face, name: string): Motion {
    const step = this.steps.find((candidate) => candidate.name === name);
    if (!step) throw new Error(`${this.where()}: no step named "${name}"`);
    return face.history[step.lastOperation]!;
  }

  private current(face: Face): Motion {
    return face.history[face.history.length - 1]!;
  }

  private info(face: Face): FaceInfo {
    let x = 0;
    let y = 0;
    for (const id of face.polygon) {
      x += this.points[id]![0];
      y += this.points[id]![1];
    }
    const cp: Vec2 = [x / face.polygon.length, y / face.polygon.length];
    return { cp, world: apply(this.current(face), [cp[0], cp[1], 0]), tags: face.tags };
  }

  private where(): string {
    return `step ${this.steps.length + 1}`;
  }

  private point([x, y]: Vec2): number {
    const found = this.points.findIndex(
      ([px, py]) => Math.abs(px - x) < EPSILON && Math.abs(py - y) < EPSILON,
    );
    if (found >= 0) return found;
    this.points.push([x, y]);
    return this.points.length - 1;
  }

  build(): SequenceOutput {
    // A face cut after its neighbour was left whole has a vertex part-way along its side; put it
    // in, so every side of every face is an edge shared with at most one other face.
    const used = new Set(this.faces.flatMap((face) => face.polygon));
    const polygons = this.faces.map((face) => this.withSideVertices(face.polygon, used));

    const ids = [...used].sort((a, b) => a - b);
    const index = new Map(ids.map((id, i) => [id, i]));
    const faces = polygons.map((polygon) => polygon.map((id) => index.get(id)!));

    const edges: [number, number][] = [];
    const edgeKey = new Map<string, number>();
    const edgeFaces: Array<Array<{ face: number; forward: boolean }>> = [];
    faces.forEach((polygon, f) => {
      polygon.forEach((u, i) => {
        const v = polygon[(i + 1) % polygon.length]!;
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        let e = edgeKey.get(key);
        if (e === undefined) {
          e = edges.length;
          edgeKey.set(key, e);
          edges.push([u, v]);
          edgeFaces.push([]);
        }
        edgeFaces[e]!.push({ face: f, forward: edges[e]![0] === u });
      });
    });

    const cp = (v: number): Vec3 => {
      const [x, y] = this.points[ids[v]!]!;
      return [x, y, 0];
    };

    const frameOperations = [0, ...this.steps.map((step) => step.lastOperation)];
    const positions = frameOperations.map((op, frame) => {
      const placed: Array<Vec3 | undefined> = new Array(ids.length);
      faces.forEach((polygon, f) => {
        const motion = this.faces[f]!.history[op]!;
        for (const v of polygon) {
          const p = apply(motion, cp(v));
          const earlier = placed[v];
          if (earlier && Math.hypot(...sub(earlier, p)) > 1e-8) {
            throw new Error(`frame ${frame}: vertex ${v} is torn (faces disagree on where it is)`);
          }
          placed[v] = p;
        }
      });
      return placed.map((p) => [p![0], p![1], p![2]] as [number, number, number]);
    });

    const assignments = this.assign(edges, edgeFaces, cp);

    return {
      vertices: ids.map((_, v) => [...cp(v)] as [number, number, number]),
      edges,
      assignments: assignments[0]!,
      faces,
      frames: this.steps.map((step, i) => ({
        title: step.title,
        description: step.description,
        vertices: positions[i + 1]!,
        assignments: assignments[i + 1]!,
      })),
    };
  }

  private withSideVertices(polygon: number[], used: Set<number>): number[] {
    const out: number[] = [];
    polygon.forEach((u, i) => {
      const v = polygon[(i + 1) % polygon.length]!;
      const [ux, uy] = this.points[u]!;
      const [vx, vy] = this.points[v]!;
      const length2 = (vx - ux) ** 2 + (vy - uy) ** 2;
      const between: Array<[number, number]> = [];
      for (const w of used) {
        if (w === u || w === v) continue;
        const [wx, wy] = this.points[w]!;
        const t = ((wx - ux) * (vx - ux) + (wy - uy) * (vy - uy)) / length2;
        if (t <= EPSILON || t >= 1 - EPSILON) continue;
        const off = Math.abs((vx - ux) * (wy - uy) - (vy - uy) * (wx - ux)) / Math.sqrt(length2);
        if (off < EPSILON) between.push([t, w]);
      }
      out.push(u, ...between.sort((a, b) => a[0] - b[0]).map(([, w]) => w));
    });
    return out;
  }

  /**
   * Mountain or valley for every crease in every frame. A crease that is part-way folded reads its
   * letter from its angle. One folded flat keeps the letter it had when it last moved, which comes
   * from the fold's nudge, from the step's `signs`, or from the partial angle it passed through.
   */
  private assign(
    edges: [number, number][],
    edgeFaces: Array<Array<{ face: number; forward: boolean }>>,
    cp: (v: number) => Vec3,
  ): Assignment[][] {
    const frames: Assignment[][] = this.steps.map(() => []);
    const first: Assignment[] = [];

    edges.forEach(([u, v], e) => {
      const sides = edgeFaces[e]!;
      if (sides.length === 1) {
        first.push("B");
        frames.forEach((frame) => frame.push("B"));
        return;
      }
      // The face that runs u→v is f1 in the dihedral formula (see src/fold/geometry.ts).
      const f1 = this.faces[sides.find((s) => s.forward)!.face]!;
      const f2 = this.faces[sides.find((s) => !s.forward)!.face]!;
      const a = cp(u);
      const b = cp(v);
      const angleAt = (m1: Motion, m2: Motion) => dihedral(m1, m2, a, b);
      const midpoint: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

      let sign: 1 | -1 | 0 = 0;
      let firstSign: 1 | -1 | 0 = 0;
      this.steps.forEach((step, s) => {
        let moved = false;
        for (let op = step.firstOperation; op <= step.lastOperation; op++) {
          const before = relative(f1.history[op - 1]!, f2.history[op - 1]!);
          const after = relative(f1.history[op]!, f2.history[op]!);
          const changed = !sameMotion(before, after);
          const t1 = f1.turns[op]!;
          const t2 = f2.turns[op]!;
          // One side turns about the fold line, which is this crease: nudge it and read the sign.
          const nudged = (t1 === 0) !== (t2 === 0);
          if (nudged) sign = Math.sign(angleAt(f1.probes[op]!, f2.probes[op]!)) as 1 | -1;
          // Both sides turn, opposite ways, and land together: a reverse fold turns this part of
          // the flap inside out, so a flat crease between them changes over.
          const reversed = t1 !== 0 && t2 !== 0 && Math.sign(t1) !== Math.sign(t2);
          if (
            reversed &&
            Math.abs(angleAt(f1.history[op - 1]!, f2.history[op - 1]!)) >= 180 - FLAT_DEGREES
          ) {
            sign = -sign as 1 | -1;
          }
          const theta = angleAt(f1.history[op]!, f2.history[op]!);
          if (Math.abs(theta) > FLAT_DEGREES && Math.abs(theta) < 180 - FLAT_DEGREES) {
            sign = Math.sign(theta) as 1 | -1;
          } else if (changed && !nudged && Math.abs(theta) >= 180 - FLAT_DEGREES) {
            const wasPartial =
              Math.abs(angleAt(f1.history[op - 1]!, f2.history[op - 1]!)) > FLAT_DEGREES;
            if (!wasPartial) sign = 0;
          }
          moved ||= changed || nudged || reversed;
        }
        const theta = angleAt(f1.history[step.lastOperation]!, f2.history[step.lastOperation]!);
        const flatFolded = Math.abs(theta) >= 180 - FLAT_DEGREES;
        const override = moved && flatFolded ? step.signs?.(midpoint) : undefined;
        if (override) sign = override === "V" ? 1 : -1;
        if (flatFolded && sign === 0) {
          throw new Error(
            `step ${s + 1} "${step.title}": no mountain or valley for the crease at ` +
              `(${midpoint.map((x) => x.toFixed(3)).join(", ")}) between faces tagged ` +
              `[${[...f1.tags].join(", ")}] and [${[...f2.tags].join(", ")}]`,
          );
        }
        if (firstSign === 0 && Math.abs(theta) > FLAT_DEGREES) firstSign = sign;
        frames[s]!.push(Math.abs(theta) <= FLAT_DEGREES ? "F" : sign > 0 ? "V" : "M");
      });
      first.push(firstSign === 0 ? "F" : firstSign > 0 ? "V" : "M");
    });

    return [first, ...frames];
  }
}

/** Fold angle in degrees between two faces sharing the crease a→b, as `src/fold/geometry.ts` measures it. */
function dihedral(m1: Motion, m2: Motion, a: Vec3, b: Vec3): number {
  const n1 = apply({ r: m1.r, t: [0, 0, 0] }, [0, 0, 1]);
  const n2 = apply({ r: m2.r, t: [0, 0, 0] }, [0, 0, 1]);
  const along = sub(apply(m1, b), apply(m1, a));
  const u = scale(along, 1 / Math.hypot(...along));
  return (Math.atan2(dot(cross(n2, n1), u), dot(n1, n2)) * 180) / Math.PI;
}

/** Three vertices of a face spanning as much area as possible, for a well-conditioned fit. */
function widestTriangle(
  polygon: readonly number[],
  at: (v: number) => Vec3,
): [number, number, number] {
  let best: [number, number, number] = [polygon[0]!, polygon[1]!, polygon[2]!];
  let area = -1;
  for (let i = 0; i < polygon.length; i++) {
    for (let j = i + 1; j < polygon.length; j++) {
      for (let k = j + 1; k < polygon.length; k++) {
        const [p, q, r] = [at(polygon[i]!), at(polygon[j]!), at(polygon[k]!)];
        const twice = Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]));
        if (twice > area) {
          area = twice;
          best = [polygon[i]!, polygon[j]!, polygon[k]!];
        }
      }
    }
  }
  return best;
}

function relative(m1: Motion, m2: Motion): Motion {
  return compose(invertMotion(m1), m2);
}

function sameMotion(a: Motion, b: Motion): boolean {
  return (
    a.r.every((x, i) => Math.abs(x - b.r[i]!) < 1e-9) &&
    a.t.every((x, i) => Math.abs(x - b.t[i]!) < 1e-9)
  );
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
