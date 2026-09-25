/**
 * Finds rigid in-between states of a fold by numerical continuation, for `folding-sequence.ts`.
 *
 * Given the sheet's state before a step and after it, which faces the step moves, and one crease
 * that drives the motion, it walks from the start towards the end in small increments. At each it
 * solves, by Levenberg–Marquardt, for positions of the moving vertices that keep every face exactly
 * rigid (all distances within a face fixed) and give the driving crease its share of the way from
 * its start angle to its end angle. Each solution starts from the one before, so the path is the
 * one reached continuously from the start: a petal fold's flaps swing in the way paper goes, not
 * the other way round.
 *
 * It fails loudly rather than approximately: if no rigid state exists part-way (the step needs the
 * paper to bend), or the path does not arrive at the end state given (the end was specified
 * wrongly, or the motion went down another branch), it throws.
 */

type Vec = [number, number, number];
type Point = readonly [number, number, number];

export interface InBetweenProblem {
  /** Crease-pattern position of every point, z = 0. */
  flat: ReadonlyArray<Point>;
  /** Faces, as point indices. */
  faces: ReadonlyArray<readonly number[]>;
  /** Where every point is before the step, and after it. */
  start: ReadonlyArray<Point>;
  end: ReadonlyArray<Point>;
  /** Which faces the step moves. Points on faces that do not move stay where they are. */
  moving: ReadonlyArray<boolean>;
  /** The two faces either side of the driving crease. */
  driver: readonly [number, number];
  /** Fractions of the driving crease's turn, strictly between 0 and 1, to return states for. */
  fractions: readonly number[];
  /** Where the problem is being solved, for error messages. */
  where: string;
}

/** Positions of every point at each requested fraction, in the order asked. */
export function rigidInBetweens(problem: InBetweenProblem): Vec[][] {
  const { flat, faces, start, end, moving, driver, fractions } = problem;
  const pointCount = flat.length;

  // Unknowns: points not on any face that stays put.
  const fixed = new Uint8Array(pointCount);
  faces.forEach((face, f) => {
    if (!moving[f]) for (const v of face) fixed[v] = 1;
  });
  const unknown = new Int32Array(pointCount).fill(-1);
  let count = 0;
  for (let v = 0; v < pointCount; v++) if (!fixed[v]) unknown[v] = count++;
  if (count === 0) throw new Error(`${problem.where}: nothing moves`);

  // Rigidity: every pair of points on a face keeps its crease-pattern distance.
  const pairs: Array<[number, number, number]> = [];
  const seen = new Set<string>();
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      for (let j = i + 1; j < face.length; j++) {
        const [a, b] = [face[i]!, face[j]!];
        if (fixed[a] && fixed[b]) continue;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([a, b, distance(flat[a]!, flat[b]!)]);
      }
    }
  }

  const size = Math.max(...flat.map((p) => Math.hypot(p[0], p[1])));
  const angleAt = (positions: ReadonlyArray<Point>) =>
    openingAngle(normal(faces[driver[0]]!, positions), normal(faces[driver[1]]!, positions));
  const angleStart = angleAt(start);
  const angleEnd = angleAt(end);

  // Solve along a grid of increments that includes every fraction asked for.
  const grid = new Set<number>();
  for (let k = 1; k < 90; k++) grid.add(k / 90);
  for (const s of fractions) grid.add(s);
  const last = Math.max(...fractions, 0.97);
  grid.add(last);
  const steps = [...grid].filter((s) => s <= last).sort((x, y) => x - y);

  const results = new Map<number, Vec[]>();
  let previous = start.map((p) => [...p] as Vec);
  let beforeThat: Vec[] | null = null;
  let previousS = 0;
  let beforeThatS = 0;
  for (const s of steps) {
    // Guess: carry on in the direction the last increments went; at first, head for the end.
    let guess: Vec[];
    if (beforeThat) {
      const scale = (s - previousS) / Math.max(previousS - beforeThatS, 1e-12);
      guess = previous.map((p, v) => {
        const q = beforeThat![v]!;
        return [
          p[0] + scale * (p[0] - q[0]),
          p[1] + scale * (p[1] - q[1]),
          p[2] + scale * (p[2] - q[2]),
        ];
      });
    } else {
      guess = previous.map((p, v) => {
        if (fixed[v]) return [...p] as Vec;
        const q = end[v]!;
        return [p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1]), p[2] + s * (q[2] - p[2])];
      });
    }
    const target = angleStart + s * (angleEnd - angleStart);
    const solved = solve(guess, unknown, count, pairs, faces, driver, target, size);
    if (!solved) {
      throw new Error(
        `${problem.where}: no rigid state ${(s * 100).toFixed(1)}% of the way; the step needs the paper to bend`,
      );
    }
    beforeThat = previous;
    beforeThatS = previousS;
    previous = solved;
    previousS = s;
    if (fractions.includes(s))
      results.set(
        s,
        solved.map((p) => [...p] as Vec),
      );
  }

  // The path must arrive where the step says it ends.
  let gap = 0;
  for (let v = 0; v < pointCount; v++) gap = Math.max(gap, distance(previous[v]!, end[v]!));
  const expected = (1 - last) * Math.PI * size;
  if (gap > Math.max(expected * 2, 0.02 * size)) {
    throw new Error(
      `${problem.where}: the rigid path does not arrive at the step's end (still ${(gap / size).toFixed(3)} of the model away at ${(last * 100).toFixed(0)}%)`,
    );
  }
  return fractions.map((s) => results.get(s)!);
}

/** Levenberg–Marquardt on the rigidity and driver residuals. Null if it does not converge. */
function solve(
  guess: Vec[],
  unknown: Int32Array,
  count: number,
  pairs: ReadonlyArray<readonly [number, number, number]>,
  faces: ReadonlyArray<readonly number[]>,
  driver: readonly [number, number],
  target: number,
  size: number,
): Vec[] | null {
  const n = 3 * count;
  const positions = guess.map((p) => [...p] as Vec);
  const driverPoints = [...new Set([...faces[driver[0]]!, ...faces[driver[1]]!])].filter(
    (v) => unknown[v]! >= 0,
  );

  const residuals = (at: Vec[]): number[] => {
    const r = pairs.map(([a, b, rest]) => distance(at[a]!, at[b]!) - rest);
    const angle = openingAngle(normal(faces[driver[0]]!, at), normal(faces[driver[1]]!, at));
    r.push(size * (angle - target));
    return r;
  };

  let r = residuals(positions);
  let cost = sumSquares(r);
  let lambda = 1e-3;
  for (let iteration = 0; iteration < 300; iteration++) {
    if (Math.max(...r.map(Math.abs)) < 1e-12 * size) return positions;

    // Jacobian rows: analytic for distances, finite differences for the driver.
    const rows: Array<Array<[number, number]>> = pairs.map(([a, b]) => {
      const pa = positions[a]!;
      const pb = positions[b]!;
      const d = Math.max(distance(pa, pb), 1e-15);
      const row: Array<[number, number]> = [];
      for (let k = 0; k < 3; k++) {
        const g = (pa[k]! - pb[k]!) / d;
        if (unknown[a]! >= 0) row.push([3 * unknown[a]! + k, g]);
        if (unknown[b]! >= 0) row.push([3 * unknown[b]! + k, -g]);
      }
      return row;
    });
    const driverRow: Array<[number, number]> = [];
    const h = 1e-7 * size;
    for (const v of driverPoints) {
      for (let k = 0; k < 3; k++) {
        const saved = positions[v]![k]!;
        positions[v]![k] = saved + h;
        const up = residuals(positions).at(-1)!;
        positions[v]![k] = saved - h;
        const down = residuals(positions).at(-1)!;
        positions[v]![k] = saved;
        driverRow.push([3 * unknown[v]! + k, (up - down) / (2 * h)]);
      }
    }
    rows.push(driverRow);

    // Normal equations JᵀJ δ = −Jᵀr, damped.
    const jtj = new Float64Array(n * n);
    const jtr = new Float64Array(n);
    rows.forEach((row, i) => {
      for (const [p, gp] of row) {
        jtr[p] = jtr[p]! + gp * r[i]!;
        for (const [q, gq] of row) jtj[p * n + q] = jtj[p * n + q]! + gp * gq;
      }
    });

    let improved = false;
    for (let attempt = 0; attempt < 12 && !improved; attempt++) {
      const a = Float64Array.from(jtj);
      for (let p = 0; p < n; p++) a[p * n + p] = a[p * n + p]! * (1 + lambda) + lambda * 1e-9;
      const delta = solveLinear(
        a,
        Float64Array.from(jtr, (x) => -x),
        n,
      );
      if (!delta) {
        lambda *= 10;
        continue;
      }
      const trial = positions.map((p) => [...p] as Vec);
      for (let v = 0; v < unknown.length; v++) {
        const u = unknown[v]!;
        if (u < 0) continue;
        for (let k = 0; k < 3; k++) trial[v]![k] = trial[v]![k]! + delta[3 * u + k]!;
      }
      const trialR = residuals(trial);
      const trialCost = sumSquares(trialR);
      if (trialCost < cost) {
        for (let v = 0; v < positions.length; v++) positions[v] = trial[v]!;
        r = trialR;
        cost = trialCost;
        lambda = Math.max(lambda / 3, 1e-12);
        improved = true;
      } else {
        lambda *= 10;
      }
    }
    if (!improved) break;
  }
  return Math.max(...r.map(Math.abs)) < 1e-11 * size ? positions : null;
}

/** Gaussian elimination with partial pivoting; null if singular. */
function solveLinear(a: Float64Array, b: Float64Array, n: number): Float64Array | null {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row * n + col]!) > Math.abs(a[pivot * n + col]!)) pivot = row;
    }
    if (Math.abs(a[pivot * n + col]!) < 1e-300) return null;
    if (pivot !== col) {
      for (let k = 0; k < n; k++) {
        const t = a[col * n + k]!;
        a[col * n + k] = a[pivot * n + k]!;
        a[pivot * n + k] = t;
      }
      const t = b[col]!;
      b[col] = b[pivot]!;
      b[pivot] = t;
    }
    for (let row = col + 1; row < n; row++) {
      const factor = a[row * n + col]! / a[col * n + col]!;
      if (factor === 0) continue;
      for (let k = col; k < n; k++) a[row * n + k] = a[row * n + k]! - factor * a[col * n + k]!;
      b[row] = b[row]! - factor * b[col]!;
    }
  }
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row]!;
    for (let k = row + 1; k < n; k++) sum -= a[row * n + k]! * x[k]!;
    x[row] = sum / a[row * n + row]!;
  }
  return x;
}

/** Newell's normal of a face. */
function normal(face: readonly number[], at: ReadonlyArray<Point>): Vec {
  let x = 0;
  let y = 0;
  let z = 0;
  face.forEach((v, i) => {
    const a = at[v]!;
    const b = at[face[(i + 1) % face.length]!]!;
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  });
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/** The angle between two faces' normals, in radians: how far their crease is folded, unsigned. */
function openingAngle(n1: Vec, n2: Vec): number {
  const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
  const cross = Math.hypot(
    n1[1] * n2[2] - n1[2] * n2[1],
    n1[2] * n2[0] - n1[0] * n2[2],
    n1[0] * n2[1] - n1[1] * n2[0],
  );
  return Math.atan2(cross, dot);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function sumSquares(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v * v;
  return sum;
}
