/**
 * Orders sheets of paper lying flat on each other, from the rules any flat fold obeys. The terms
 * are the usual ones from the layer-ordering literature: a *taco* is a crease folded flat, its two
 * faces stacked with the fold between them; a *tortilla* is a face lying flat across a line.
 *
 * - A crease's mountain or valley fixes which of its two faces is on top.
 * - Taco–taco: two folds along the same line may nest or sit apart, never interleave.
 * - Taco–tortilla: a face that a fold's line crosses cannot lie between that fold's two faces.
 * - Transitivity: among faces that all overlap, above is transitive.
 *
 * Every pair of overlapping faces gets a variable, "which is on top"; the rules are propagated and
 * the search backtracks when they conflict. Branches are tried in the order `prefer` suggests, so
 * where the rules leave a choice the answer is the caller's best guess. Everything here works on
 * abstract indices ("groups") ordered along one direction; `layers.ts` supplies the geometry.
 */

/** A fold lying flat: `lower` is below `upper` along the stack. */
export interface FlatTaco {
  lower: number;
  upper: number;
}

export interface FlatOrderProblem {
  count: number;
  /** Pairs whose insides overlap: each needs an order. */
  overlaps: ReadonlyArray<readonly [number, number]>;
  /** Folds lying flat, in the pairs above. */
  tacos: readonly FlatTaco[];
  /** Pairs of folds along one line, faces on the same side. */
  tacoTaco: ReadonlyArray<readonly [FlatTaco, FlatTaco]>;
  /** A group crossed by a fold's line, and the fold. */
  tacoTortilla: ReadonlyArray<readonly [number, FlatTaco]>;
  /**
   * Orders that must go the same way round, [a, b, c, d]: b is above a exactly when d is above c.
   * For stacks in different planes that the paper bends between (see `layers.ts`).
   */
  linked: ReadonlyArray<readonly [number, number, number, number]>;
  /** Which way to try first when the rules leave a choice: true if `a` should go below `b`. */
  prefer(a: number, b: number): boolean;
  /** How many guesses the search may make before giving up. */
  budget: number;
}

/** Every overlapping pair ordered as [lower, upper], or undefined if no order satisfies the rules. */
export function solveFlatOrder(
  problem: FlatOrderProblem,
): Array<[lower: number, upper: number]> | undefined {
  const { count } = problem;
  const key = (a: number, b: number) => (a < b ? a * count + b : b * count + a);
  // +1: the larger index is above; −1: the smaller is.
  const value = new Map<number, 1 | -1 | 0>();
  const neighbours = new Map<number, Set<number>>();
  const watchers = new Map<number, Array<() => boolean>>();

  const addNeighbour = (a: number, b: number) => {
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    neighbours.get(a)!.add(b);
  };
  for (const [a, b] of problem.overlaps) {
    if (a === b || value.has(key(a, b))) continue;
    value.set(key(a, b), 0);
    addNeighbour(a, b);
    addNeighbour(b, a);
  }
  const known = (a: number, b: number) => value.has(key(a, b));

  /** +1 if b is above a, −1 if below, 0 if not yet decided. */
  const get = (a: number, b: number): 1 | -1 | 0 => {
    const v = value.get(key(a, b)) ?? 0;
    return a < b ? v : (-v as 1 | -1 | 0);
  };

  const trail: number[] = [];
  const queue: Array<[number, number]> = [];
  /** Records that b is above a (sign +1) or below (−1). False on a contradiction. */
  const set = (a: number, b: number, sign: 1 | -1): boolean => {
    const current = get(a, b);
    if (current !== 0) return current === sign;
    const k = key(a, b);
    value.set(k, (a < b ? sign : -sign) as 1 | -1);
    trail.push(k);
    queue.push([a, b]);
    return true;
  };

  const watch = (a: number, b: number, check: () => boolean) => {
    const k = key(a, b);
    if (!watchers.has(k)) watchers.set(k, []);
    watchers.get(k)!.push(check);
  };

  /** Two variables that must agree: s(a, b) = s(c, d). */
  const equal = (a: number, b: number, c: number, d: number) => {
    if (!known(a, b) || !known(c, d)) return;
    const check = () => {
      const x = get(a, b);
      const y = get(c, d);
      if (x !== 0) return set(c, d, x);
      if (y !== 0) return set(a, b, y);
      return true;
    };
    watch(a, b, check);
    watch(c, d, check);
  };

  // Taco–tortilla: the crossed group is on the same side of both of the fold's faces.
  for (const [c, taco] of problem.tacoTortilla) {
    if (c === taco.lower || c === taco.upper) continue;
    equal(c, taco.lower, c, taco.upper);
  }

  for (const [a, b, c, d] of problem.linked) equal(a, b, c, d);

  // Taco–taco: r is strictly inside [p, q] exactly when t is, and the same the other way round.
  const inside = (x: number, p: number, q: number): boolean | undefined => {
    const abovePLower = get(p, x);
    const belowQ = get(q, x);
    if (abovePLower === -1 || belowQ === 1) return false;
    if (abovePLower === 1 && belowQ === -1) return true;
    return undefined;
  };
  const forceInside = (x: number, p: number, q: number, wanted: boolean): boolean => {
    if (wanted) return set(p, x, 1) && set(q, x, -1);
    // Not inside: once one side is known to hold x inside it, the other must let x out.
    if (get(p, x) === 1) return set(q, x, 1);
    if (get(q, x) === -1) return set(p, x, -1);
    return true;
  };
  const laminar = (outer: FlatTaco, one: number, other: number) => {
    const { lower: p, upper: q } = outer;
    if (new Set([p, q, one, other]).size < 4) return;
    if (![p, q].every((x) => known(x, one) && known(x, other))) return;
    const check = () => {
      const a = inside(one, p, q);
      const b = inside(other, p, q);
      if (a !== undefined) return forceInside(other, p, q, a);
      if (b !== undefined) return forceInside(one, p, q, b);
      return true;
    };
    for (const x of [p, q]) {
      watch(x, one, check);
      watch(x, other, check);
    }
  };
  for (const [a, b] of problem.tacoTaco) {
    laminar(a, b.lower, b.upper);
    laminar(b, a.lower, a.upper);
  }

  /** Applies everything the queued decisions imply. False on a contradiction. */
  const propagate = (): boolean => {
    while (queue.length > 0) {
      const [a, b] = queue.pop()!;
      const sign = get(a, b);
      const [lower, upper] = sign > 0 ? [a, b] : [b, a];
      // Transitivity through every group overlapping both.
      const around = neighbours.get(lower);
      const beyond = neighbours.get(upper);
      if (around && beyond) {
        for (const c of around) {
          if (c === upper || !beyond.has(c)) continue;
          if (get(c, lower) === 1 && !set(c, upper, 1)) return false; // c < lower < upper
          if (get(upper, c) === 1 && !set(lower, c, 1)) return false; // lower < upper < c
        }
      }
      for (const check of watchers.get(key(a, b)) ?? []) if (!check()) return false;
    }
    return true;
  };

  const undo = (mark: number) => {
    while (trail.length > mark) value.set(trail.pop()!, 0);
    queue.length = 0;
  };

  for (const { lower, upper } of problem.tacos) {
    if (known(lower, upper) && !set(lower, upper, 1)) return undefined;
  }
  if (!propagate()) return undefined;

  const pairs = [...value.keys()];
  let budget = problem.budget;
  const search = (from: number): boolean => {
    let i = from;
    while (i < pairs.length && value.get(pairs[i]!) !== 0) i++;
    if (i === pairs.length) return true;
    if (--budget < 0) return false;
    const a = Math.floor(pairs[i]! / count);
    const b = pairs[i]! % count;
    const first: 1 | -1 = problem.prefer(a, b) ? 1 : -1;
    for (const sign of [first, -first as 1 | -1]) {
      const mark = trail.length;
      if (set(a, b, sign) && propagate() && search(i + 1)) return true;
      undo(mark);
      if (budget < 0) return false;
    }
    return false;
  };
  if (!search(0)) return undefined;

  return pairs.map((k) => {
    const a = Math.floor(k / count);
    const b = k % count;
    return value.get(k)! > 0 ? [a, b] : [b, a];
  });
}
