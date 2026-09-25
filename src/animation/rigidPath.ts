import type { ResolvedModel } from "@/fold";

/**
 * Largest gap, as a fraction of the model's size, the solver is asked to close when following
 * this path. The crane's petal folds and the preliminary base's collapse leave under 6%; reverse
 * folds, which need the paper to bend, leave 11% and more.
 */
export const NEARLY_RIGID = 0.06;

/**
 * Plays a step as rigid folding: the paper's faces turn about their creases and nothing bends.
 * Starting from the face that moves least, it walks a spanning tree of faces across the creases,
 * turning each face about the crease it shares with its parent by that crease's fold angle, taken
 * part-way from one frame's to the next's. Every face is exactly rigid by construction.
 *
 * That is exactly right when a step is a rigid motion whose fold angles change in step, which is
 * what a plain fold of a stack of layers is: every face on the moving side turns about one line by
 * the same angle, so the stack swings over as one block, keeps its layers in order, and lands
 * exactly. It does not solve anything, so it cannot lag.
 *
 * It is wrong when a step needs the paper to bend, like a reverse fold, or has fold angles that
 * change at different rates, like a collapse: then the faces around a vertex put it in different
 * places. `isRigid` measures that, and those steps are left to the solver.
 */
export class RigidPath {
  private readonly flat: Float64Array;
  private readonly faceSides: Array<Array<{ edge: number; face: number }>>;
  private readonly closures = new Map<number, number>();
  private readonly trees = new Map<number, Tree>();
  private readonly size: number;
  private readonly spread: Float64Array;

  constructor(private readonly model: ResolvedModel) {
    this.flat = model.frames[0]!.coords;
    this.faceSides = model.facesVertices.map(() => []);
    model.edgesFaces.forEach((faces, edge) => {
      if (faces.length !== 2) return;
      const [a, b] = faces as [number, number];
      this.faceSides[a]!.push({ edge, face: b });
      this.faceSides[b]!.push({ edge, face: a });
    });
    this.size = extent(this.flat);
    this.spread = new Float64Array(model.vertexCount * 6);
  }

  /**
   * Whether the step from one frame to the next is a rigid motion this path follows exactly: the
   * faces around every vertex agree where it is, part-way through, to a millionth of the model.
   */
  isRigid(from: number, to: number): boolean {
    return this.closure(from, to) < 1e-6;
  }

  /**
   * Whether the step is close enough to rigid for the solver to close the gaps this path leaves
   * (see `NEARLY_RIGID`): a rigid motion whose fold angles change at different rates, like a
   * collapse or a petal fold, rather than one that needs the paper to bend, like a reverse fold.
   */
  isNearlyRigid(from: number, to: number): boolean {
    return this.closure(from, to) < NEARLY_RIGID;
  }

  /**
   * How far apart the faces around the worst vertex put it part-way through the step, as a
   * fraction of the model's size.
   */
  closure(from: number, to: number): number {
    const key = from * this.model.frames.length + to;
    let closure = this.closures.get(key);
    if (closure === undefined) {
      const out = new Float64Array(this.model.vertexCount * 3);
      closure = Math.max(...[0.25, 0.5, 0.75].map((s) => this.place(from, to, s, out))) / this.size;
      this.closures.set(key, closure);
    }
    return closure;
  }

  /**
   * Writes the model `s` of the way from frame `from` to frame `to` into `out`, and returns how
   * far apart the faces around the worst vertex put it (zero for a rigid step). A vertex is placed
   * where its faces put it on average.
   */
  place(from: number, to: number, s: number, out: Float64Array): number {
    const { model } = this;
    const tree = this.treeFor(from, to);
    const anglesFrom = model.frames[from]!.foldAngles;
    const anglesTo = model.frames[to]!.foldAngles;

    const motions: Motion[] = new Array(model.facesVertices.length);
    motions[tree.root] = this.rootMotion(tree.root, from, to, s);
    for (let i = 1; i < tree.order.length; i++) {
      const face = tree.order[i]!;
      const edge = tree.via[face]!;
      const a0 = anglesFrom[edge]!;
      const degrees = a0 + s * (anglesTo[edge]! - a0);
      motions[face] = compose(motions[tree.parent[face]!]!, this.hinge(face, edge, degrees));
    }

    // Average what each face says, and keep the spread between them.
    out.fill(0);
    const count = new Float64Array(model.vertexCount);
    const spread = this.spread;
    spread.fill(Infinity, 0, model.vertexCount * 3);
    spread.fill(-Infinity, model.vertexCount * 3);
    model.facesVertices.forEach((face, f) => {
      for (const v of face) {
        const p = apply(motions[f]!, [this.flat[3 * v]!, this.flat[3 * v + 1]!, 0]);
        for (let k = 0; k < 3; k++) {
          out[3 * v + k] = out[3 * v + k]! + p[k]!;
          spread[3 * v + k] = Math.min(spread[3 * v + k]!, p[k]!);
          spread[model.vertexCount * 3 + 3 * v + k] = Math.max(
            spread[model.vertexCount * 3 + 3 * v + k]!,
            p[k]!,
          );
        }
        count[v] = count[v]! + 1;
      }
    });
    let worst = 0;
    for (let v = 0; v < model.vertexCount; v++) {
      for (let k = 0; k < 3; k++) {
        out[3 * v + k] = out[3 * v + k]! / count[v]!;
        const i = 3 * v + k;
        worst = Math.max(worst, spread[model.vertexCount * 3 + i]! - spread[i]!);
      }
    }
    return worst;
  }

  /** The turn of `face` relative to the face it hangs from, about their shared crease. */
  private hinge(face: number, edge: number, degrees: number): Motion {
    const [a, b] = this.model.edgesVertices[edge]!;
    const polygon = this.model.facesVertices[face]!;
    // The dihedral angle is measured with the face that runs a→b as the first; turning the other
    // face about a→b by the angle's negative gives the same fold.
    const runsForward = polygon[(polygon.indexOf(a) + 1) % polygon.length] === b;
    const pa: Vec = [this.flat[3 * a]!, this.flat[3 * a + 1]!, 0];
    const dx = this.flat[3 * b]! - pa[0];
    const dy = this.flat[3 * b + 1]! - pa[1];
    const length = Math.hypot(dx, dy);
    const radians = (degrees * Math.PI) / 180;
    return rotationAbout(pa, [dx / length, dy / length, 0], runsForward ? radians : -radians);
  }

  /**
   * The root face's own motion: from where it is in one frame to where it is in the next, turning
   * about its centre. For the usual root, a face the step does not move, that is standing still.
   */
  private rootMotion(root: number, from: number, to: number, s: number): Motion {
    const start = this.faceMotion(root, from);
    if (s === 0) return start;
    const end = this.faceMotion(root, to);
    if (s === 1) return end;
    const relative = compose(end, invert(start));
    const centre = this.centroid(root, from);
    const moved = apply(relative, centre);
    const turn = slerpFromIdentity(relative.r, s);
    const place: Vec = [
      centre[0] + s * (moved[0] - centre[0]),
      centre[1] + s * (moved[1] - centre[1]),
      centre[2] + s * (moved[2] - centre[2]),
    ];
    const turned = apply({ r: turn, t: [0, 0, 0] }, centre);
    const partial: Motion = {
      r: turn,
      t: [place[0] - turned[0], place[1] - turned[1], place[2] - turned[2]],
    };
    return compose(partial, start);
  }

  /** The rigid motion taking a face from the flat sheet to where it is in a frame. */
  private faceMotion(face: number, frame: number): Motion {
    const coords = this.model.frames[frame]!.coords;
    const [a, b, c] = widestCorner(this.model.facesVertices[face]!, this.flat);
    const flat = (v: number): Vec => [this.flat[3 * v]!, this.flat[3 * v + 1]!, 0];
    const placed = (v: number): Vec => [coords[3 * v]!, coords[3 * v + 1]!, coords[3 * v + 2]!];
    return fitTriangle([flat(a), flat(b), flat(c)], [placed(a), placed(b), placed(c)]);
  }

  private centroid(face: number, frame: number): Vec {
    const coords = this.model.frames[frame]!.coords;
    const polygon = this.model.facesVertices[face]!;
    const sum: Vec = [0, 0, 0];
    for (const v of polygon) {
      for (let k = 0; k < 3; k++) sum[k] = sum[k]! + coords[3 * v + k]!;
    }
    return [sum[0] / polygon.length, sum[1] / polygon.length, sum[2] / polygon.length];
  }

  /** A spanning tree of faces from the face the step moves least, found once per step. */
  private treeFor(from: number, to: number): Tree {
    const key = from * this.model.frames.length + to;
    let tree = this.trees.get(key);
    if (tree) return tree;
    const a = this.model.frames[from]!.coords;
    const b = this.model.frames[to]!.coords;
    let root = 0;
    let least = Infinity;
    this.model.facesVertices.forEach((polygon, face) => {
      let moved = 0;
      for (const v of polygon) {
        moved += Math.hypot(
          a[3 * v]! - b[3 * v]!,
          a[3 * v + 1]! - b[3 * v + 1]!,
          a[3 * v + 2]! - b[3 * v + 2]!,
        );
      }
      if (moved < least) {
        least = moved;
        root = face;
      }
    });
    const count = this.model.facesVertices.length;
    const parent = new Int32Array(count).fill(-1);
    const via = new Int32Array(count).fill(-1);
    const seen = new Uint8Array(count);
    const order = [root];
    seen[root] = 1;
    for (let i = 0; i < order.length; i++) {
      const face = order[i]!;
      for (const { edge, face: next } of this.faceSides[face]!) {
        if (seen[next]) continue;
        seen[next] = 1;
        parent[next] = face;
        via[next] = edge;
        order.push(next);
      }
    }
    tree = { root, parent, via, order };
    this.trees.set(key, tree);
    return tree;
  }
}

interface Tree {
  root: number;
  parent: Int32Array;
  via: Int32Array;
  /** Faces in the order they are reached, root first. */
  order: number[];
}

type Vec = [number, number, number];

/** A proper rigid motion, world = r·p + t, with r row-major. */
interface Motion {
  r: number[];
  t: Vec;
}

function apply(m: Motion, p: Vec): Vec {
  const { r, t } = m;
  return [
    r[0]! * p[0] + r[1]! * p[1] + r[2]! * p[2] + t[0],
    r[3]! * p[0] + r[4]! * p[1] + r[5]! * p[2] + t[1],
    r[6]! * p[0] + r[7]! * p[1] + r[8]! * p[2] + t[2],
  ];
}

/** `outer ∘ inner`: apply `inner` first. */
function compose(outer: Motion, inner: Motion): Motion {
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

function invert(m: Motion): Motion {
  const { r } = m;
  const rt = [r[0]!, r[3]!, r[6]!, r[1]!, r[4]!, r[7]!, r[2]!, r[5]!, r[8]!];
  const t = apply({ r: rt, t: [0, 0, 0] }, m.t);
  return { r: rt, t: [-t[0], -t[1], -t[2]] };
}

function rotationAbout(point: Vec, axis: Vec, radians: number): Motion {
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

/** The rotation `s` of the way from none to `r`, the short way round. */
function slerpFromIdentity(r: number[], s: number): number[] {
  const trace = r[0]! + r[4]! + r[8]!;
  const angle = Math.acos(Math.min(1, Math.max(-1, (trace - 1) / 2)));
  if (angle < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let axis: Vec = [r[7]! - r[5]!, r[2]! - r[6]!, r[3]! - r[1]!];
  let length = Math.hypot(...axis);
  if (length < 1e-9) {
    // A half-turn: the axis is the column of r + I with the largest entry.
    const columns: Vec[] = [0, 1, 2].map((j) => [
      r[j]! + (j === 0 ? 1 : 0),
      r[3 + j]! + (j === 1 ? 1 : 0),
      r[6 + j]! + (j === 2 ? 1 : 0),
    ]);
    axis = columns.reduce((best, column) =>
      Math.hypot(...column) > Math.hypot(...best) ? column : best,
    );
    length = Math.hypot(...axis);
  }
  return rotationAbout([0, 0, 0], [axis[0] / length, axis[1] / length, axis[2] / length], s * angle)
    .r;
}

/** The rigid motion taking one triangle onto a congruent one. */
function fitTriangle(flat: [Vec, Vec, Vec], placed: [Vec, Vec, Vec]): Motion {
  const frame = ([p, q, w]: [Vec, Vec, Vec]) => {
    const e1 = unit(sub(q, p));
    const e3 = unit(cross(sub(q, p), sub(w, p)));
    return [e1, cross(e3, e1), e3] as const;
  };
  const a = frame(flat);
  const b = frame(placed);
  const r: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++)
      r.push(b[0][i]! * a[0][j]! + b[1][i]! * a[1][j]! + b[2][i]! * a[2][j]!);
  }
  const moved = apply({ r, t: [0, 0, 0] }, flat[0]);
  return { r, t: sub(placed[0], moved) };
}

/** Three vertices of a face spanning as much area as possible, for a well-conditioned fit. */
function widestCorner(polygon: readonly number[], flat: Float64Array): [number, number, number] {
  let best: [number, number, number] = [polygon[0]!, polygon[1]!, polygon[2]!];
  let area = -1;
  for (let i = 0; i < polygon.length; i++) {
    for (let j = i + 1; j < polygon.length; j++) {
      for (let k = j + 1; k < polygon.length; k++) {
        const [a, b, c] = [polygon[i]!, polygon[j]!, polygon[k]!];
        const twice = Math.abs(
          (flat[3 * b]! - flat[3 * a]!) * (flat[3 * c + 1]! - flat[3 * a + 1]!) -
            (flat[3 * c]! - flat[3 * a]!) * (flat[3 * b + 1]! - flat[3 * a + 1]!),
        );
        if (twice > area) {
          area = twice;
          best = [a, b, c];
        }
      }
    }
  }
  return best;
}

function extent(coords: Float64Array): number {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < coords.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, coords[i + k]!);
      max[k] = Math.max(max[k]!, coords[i + k]!);
    }
  }
  return Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) || 1;
}

function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(a: Vec): Vec {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
}
