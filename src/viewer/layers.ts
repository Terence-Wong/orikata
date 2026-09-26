import type { ResolvedModel } from "@/fold";
import { solveFlatOrder, type FlatTaco } from "./flatOrder";

/**
 * Past this fold angle two faces count as stacked: their normals point more against each other
 * than with, and they are kept a sheet apart in the order their mountain or valley says. Kept
 * clear of 90°, where folds often pause and rounding would decide.
 */
const STACKED_DEGREES = 120;

/**
 * Below this fold angle two faces are one flat piece of paper and share a layer. Between the two
 * thresholds faces meet at an angle, cannot overlap, and constrain each other not at all.
 */
const JOINED_DEGREES = 1;

/**
 * The largest stack, in overlapping pairs, handed to the layer search. Transitivity costs grow
 * with the cube of a stack's depth; a stack deeper than this falls back to the guess, which is
 * exact anyway when the creases alone fix the order, as in a long accordion.
 */
const MAX_STACK_PAIRS = 3000;

/** How many guesses the layer search may make for one stack before falling back. */
const SEARCH_BUDGET = 20_000;

/** A fold within this of 180° lies flat, with its two faces coinciding. */
const FLAT_TOLERANCE_DEGREES = 1e-3;

/**
 * How many pairs of faces the overlap search may compare in one frame. Enough for any model here
 * many times over; on a huge model folded flat it stops the search rather than the page.
 */
const OVERLAP_BUDGET = 4_000_000;

/** What `faceLayers` could not settle by the folding rules alone. */
export interface LayerReport {
  /** Stacks of faces lying flat on each other that had to be ordered by the guess. */
  guessed: number;
}

/**
 * The layer each face sits on in one frame, counted in sheets of paper along the face's own
 * normal. The renderer draws every face where it is but writes the depth it would have if lifted
 * by its layer times the paper's thickness, so sheets folded flat onto each other are seen in the
 * right order without anything opening a gap.
 *
 * FOLD files rarely carry `faceOrders`, but a crease's mountain or valley already says how its two
 * faces stack: a valley brings their top sides together, so each lies on the other's front, and a
 * mountain puts each behind the other. Measuring height along one direction per stack, with each
 * face facing up (+1) or down (−1) along it, a valley between f₁ and f₂ says o₁·(h₂ − h₁) ≥ 1 and a
 * mountain o₁·(h₂ − h₁) ≤ −1. Faces joined by an open crease share a height, so a sheet that is not
 * folded flat is not pulled apart at its creases: they are solved as one group. The heights are
 * the longest paths through those constraints, drawn back together by `compact`. Flaps that meet
 * only by overlapping, not at a crease, are then put in an order of their own (see below).
 */
export function faceLayers(
  model: ResolvedModel,
  frameIndex: number,
  report?: LayerReport,
): Int32Array {
  const frame = model.frames[frameIndex]!;
  const faceCount = model.facesVertices.length;

  const links: Array<{ f1: number; f2: number; stack: 0 | 1 | -1; joined: boolean; edge: number }> =
    [];
  const neighbours: Array<Array<{ face: number; stacked: boolean }>> = Array.from(
    { length: faceCount },
    () => [],
  );
  model.edgesFaces.forEach((faces, e) => {
    if (faces.length !== 2) return;
    const [f1, f2] = faces as [number, number];
    const theta = frame.foldAngles[e]!;
    let stack: 0 | 1 | -1 = 0;
    if (Math.abs(theta) >= STACKED_DEGREES) {
      const valley = frame.assignments[e] === "V" || (frame.assignments[e] !== "M" && theta > 0);
      stack = valley ? 1 : -1;
    }
    const joined = Math.abs(theta) < JOINED_DEGREES;
    links.push({ f1, f2, stack, joined, edge: e });
    // Only a crease lying flat, open or folded, says for sure which way its faces face relative
    // to each other. Across one at an angle the question has no answer, and following it round a
    // vertex can come back contradicting itself.
    if (joined || stack !== 0) {
      neighbours[f1]!.push({ face: f2, stacked: stack !== 0 });
      neighbours[f2]!.push({ face: f1, stacked: stack !== 0 });
    }
  });

  // Which way each face faces along its stack: it turns over at every stacked fold.
  const facing = new Int8Array(faceCount);
  const piece = new Int32Array(faceCount);
  for (let root = 0; root < faceCount; root++) {
    if (facing[root]) continue;
    facing[root] = 1;
    piece[root] = root;
    const queue = [root];
    while (queue.length > 0) {
      const face = queue.pop()!;
      for (const { face: next, stacked } of neighbours[face]!) {
        if (facing[next]) continue;
        facing[next] = stacked ? -facing[face]! : facing[face]!;
        piece[next] = root;
        queue.push(next);
      }
    }
  }

  // Pieces joined only at an angle were oriented independently. Where they overlap, turn one so
  // both count height the same way along their shared normal.
  const { pairs: overlaps, planes } = overlappingPairs(model, frame.coords);
  orientPieces(overlaps, facing, piece);

  // Faces joined by open creases move as one group.
  const parent = Int32Array.from({ length: faceCount }, (_, f) => f);
  const group = (f: number): number => {
    while (parent[f] !== f) {
      parent[f] = parent[parent[f]!]!;
      f = parent[f]!;
    }
    return f;
  };
  for (const { f1, f2, joined } of links) {
    if (joined) parent[group(f1)] = group(f2);
  }

  // Group `to` sits at least a sheet above group `from`.
  const above: Array<[from: number, to: number]> = [];
  const order = (lower: number, upper: number) => {
    const from = group(lower);
    const to = group(upper);
    // Inside one group the folds contradict each other; nothing to be done but ignore it.
    if (from === to) return;
    above.push([from, to]);
  };
  const tacos: Taco[] = [];
  const seams = links.filter(({ joined }) => joined).map(({ edge }) => edge);
  // Creases the paper turns a corner at, neither open nor folded flat.
  const bends = links
    .filter(
      ({ joined, edge }) =>
        !joined && Math.abs(frame.foldAngles[edge]!) < 180 - FLAT_TOLERANCE_DEGREES,
    )
    .map(({ edge }) => edge);
  links.forEach(({ f1, f2, stack, edge }) => {
    if (stack === 0) return;
    const [lower, upper] = stack * facing[f1]! > 0 ? [f1, f2] : [f2, f1];
    order(lower, upper);
    if (Math.abs(frame.foldAngles[edge]!) > 180 - FLAT_TOLERANCE_DEGREES) {
      tacos.push({ edge, lower, upper });
    }
  });

  // Where faces lie flat on each other, the folds' own rules decide most of the order that the
  // creases alone leave open (see `flatOrder.ts`); the guess below settles the rest.
  orderFlatStacks({
    model,
    coords: frame.coords,
    overlaps,
    planes,
    tacos,
    seams,
    bends,
    facing,
    group,
    above,
    order,
    report,
  });

  // Anything the rules could not settle — a stack too big to search, or a file whose folds
  // contradict — still must not leave two overlapping faces at one height, where they fight for
  // the same pixels. Such pairs are ordered by where the folds leave room for each (see
  // `rangeMiddle`) and the heights solved again, until none are left.
  let heights = new Int32Array(faceCount);
  for (let round = 0; round < 20; round++) {
    const lowest = lowestHeights(above, faceCount);
    const middle = rangeMiddle(above, faceCount);
    heights = Int32Array.from(lowest);
    compact(heights, above, faceCount);
    let ordered = false;
    for (const [a, b, sameWay] of overlaps) {
      const ga = group(a);
      const gb = group(b);
      // Comparable only if both count height the same way along their shared normal.
      if (ga === gb || facing[a] !== facing[b]! * sameWay || heights[ga] !== heights[gb]) continue;
      const aBelow = middle[ga]! < middle[gb]! || (middle[ga] === middle[gb] && ga < gb);
      if (aBelow) order(a, b);
      else order(b, a);
      ordered = true;
    }
    if (!ordered) break;
  }

  // Centre the heights, so the faces furthest from the middle of the stack are lifted least far.
  const faceHeights = Array.from({ length: faceCount }, (_, f) => heights[group(f)]!);
  const sorted = [...faceHeights].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)] ?? 0;

  const layers = new Int32Array(faceCount);
  for (let f = 0; f < faceCount; f++) layers[f] = (faceHeights[f]! - middle) * facing[f]!;
  return layers;
}

/**
 * Makes overlapping faces count height the same way along their shared normal (`facing[a]` equal
 * to `facing[b]·sameWay`) by turning over whole pieces, each piece being the faces reached from
 * one another across flat creases. A piece is turned at most once; if overlaps ask for both ways,
 * the first wins and that stack is left to the fallback.
 */
function orientPieces(
  overlaps: ReadonlyArray<readonly [number, number, 1 | -1]>,
  facing: Int8Array,
  piece: Int32Array,
): void {
  const links = new Map<number, Array<[other: number, flip: boolean]>>();
  const link = (a: number, b: number, flip: boolean) => {
    if (!links.has(a)) links.set(a, []);
    links.get(a)!.push([b, flip]);
  };
  for (const [a, b, sameWay] of overlaps) {
    const [pa, pb] = [piece[a]!, piece[b]!];
    if (pa === pb) continue;
    const flip = facing[a] !== facing[b]! * sameWay;
    link(pa, pb, flip);
    link(pb, pa, flip);
  }
  const turned = new Map<number, boolean>();
  for (const start of links.keys()) {
    if (turned.has(start)) continue;
    turned.set(start, false);
    const queue = [start];
    while (queue.length > 0) {
      const p = queue.pop()!;
      for (const [q, flip] of links.get(p)!) {
        if (turned.has(q)) continue;
        turned.set(q, turned.get(p)! !== flip);
        queue.push(q);
      }
    }
  }
  for (let f = 0; f < facing.length; f++) {
    if (turned.get(piece[f]!)) facing[f] = -facing[f]! as 1 | -1;
  }
}

/**
 * Where each group could go, halfway between as low as the stack below it allows and as high as
 * the stack above it allows (doubled, to stay whole). The sheet a flap was folded onto has the
 * flap above it and sits low in its range; the flap, with nothing above it, can rise to the top.
 * This is the guess used whenever the folds leave an order open.
 */
function rangeMiddle(
  above: ReadonlyArray<readonly [from: number, to: number]>,
  count: number,
): Int32Array {
  const lowest = lowestHeights(above, count);
  const underneath = lowestHeights(
    above.map(([from, to]) => [to, from] as const),
    count,
  );
  return Int32Array.from(lowest, (low, g) => low - underneath[g]!);
}

interface FlatStacks {
  model: ResolvedModel;
  coords: Float64Array;
  overlaps: ReadonlyArray<readonly [number, number, 1 | -1]>;
  planes: ReadonlyArray<Plane | undefined>;
  tacos: readonly Taco[];
  /** Creases the paper continues flat across: inside a group, not between groups. */
  seams: readonly number[];
  /** Creases the paper turns a corner at, neither open nor folded flat. */
  bends: readonly number[];
  facing: Int8Array;
  group: (face: number) => number;
  above: ReadonlyArray<readonly [from: number, to: number]>;
  order: (lower: number, upper: number) => void;
  report?: LayerReport;
}

/**
 * Solves each set of faces lying flat on one another (connected by overlaps) with `solveFlatOrder`
 * and records the order it finds. A set is left to the fallback if its faces do not all measure
 * height the same way, or the rules have no solution within the search budget.
 */
function orderFlatStacks({
  model,
  coords,
  overlaps,
  planes,
  tacos,
  seams,
  bends,
  facing,
  group,
  above,
  order,
  report,
}: FlatStacks): void {
  const faceCount = model.facesVertices.length;
  const parent = Int32Array.from({ length: faceCount }, (_, f) => f);
  const root = (f: number): number => {
    while (parent[f] !== f) {
      parent[f] = parent[parent[f]!]!;
      f = parent[f]!;
    }
    return f;
  };
  // Stacks are joined through groups, not faces: a group spans several faces, and every order
  // involving it has to be settled together.
  for (const [a, b] of overlaps) parent[root(group(a))] = root(group(b));
  // Stacks in two planes that the paper bends between, round one corner, are settled together.
  const corners = nestedBends(model, coords, overlaps, planes, bends, facing).filter(
    ({ p1, p2, q1, q2 }) => group(p1) !== group(p2) && group(q1) !== group(q2),
  );
  for (const { p1, q1 } of corners) parent[root(group(p1))] = root(group(q1));

  const sets = new Map<
    number,
    { faces: Set<number>; pairs: Array<[number, number]>; ok: boolean }
  >();
  const setOf = (f: number) => {
    const r = root(group(f));
    if (!sets.has(r)) sets.set(r, { faces: new Set(), pairs: [], ok: true });
    return sets.get(r)!;
  };
  for (const [a, b, sameWay] of overlaps) {
    const set = setOf(a);
    set.faces.add(a).add(b);
    // Heights are compared as `group` heights, which only works if both count the same way.
    if (facing[a] !== facing[b]! * sameWay) set.ok = false;
    const [ga, gb] = [group(a), group(b)];
    if (ga !== gb) set.pairs.push([ga, gb]);
  }

  const middle = rangeMiddle(above, faceCount);
  const tolerance = 1e-7 * modelExtent(planes);

  const segment = (edge: number): [Vec, Vec] => {
    const [u, v] = model.edgesVertices[edge]!;
    return [
      [coords[3 * u]!, coords[3 * u + 1]!, coords[3 * u + 2]!],
      [coords[3 * v]!, coords[3 * v + 1]!, coords[3 * v + 2]!],
    ];
  };

  for (const set of sets.values()) {
    if (set.pairs.length === 0) continue;
    if (!set.ok || set.pairs.length > MAX_STACK_PAIRS) {
      if (report) report.guessed++;
      continue;
    }
    const inSet = tacos.filter((taco) => set.faces.has(taco.lower) && set.faces.has(taco.upper));
    const flat = new Map<Taco, FlatTaco>(
      inSet.map((taco) => [taco, { lower: group(taco.lower), upper: group(taco.upper) }]),
    );
    const tacoTortilla: Array<[number, FlatTaco]> = [];
    const inSetSeams = seams.filter((edge) =>
      model.edgesFaces[edge]!.every((face) => set.faces.has(face)),
    );
    for (const taco of inSet) {
      const [from, to] = segment(taco.edge);
      const crossed = new Set<number>();
      for (const face of set.faces) {
        const plane = planes[face];
        if (plane && crossesInside(from, to, plane, tolerance)) crossed.add(group(face));
      }
      // A fold's line can also run along a seam: between two faces of one flat piece of paper,
      // crossing it without passing through the inside of either face.
      for (const edge of inSetSeams) {
        const [a, b] = segment(edge);
        if (sharesLength(from, to, a, b, tolerance))
          crossed.add(group(model.edgesFaces[edge]![0]!));
      }
      for (const g of crossed) tacoTortilla.push([g, flat.get(taco)!]);
    }
    const solved = solveFlatOrder({
      count: faceCount,
      overlaps: set.pairs,
      tacos: [...flat.values()],
      tacoTaco: coincidentFolds(model, coords, inSet).map(
        ([a, b]) => [flat.get(a)!, flat.get(b)!] as const,
      ),
      tacoTortilla,
      linked: corners
        .filter(({ p1 }) => set.faces.has(p1))
        .map(({ p1, p2, q1, q2, same }) =>
          same
            ? ([group(p1), group(p2), group(q1), group(q2)] as const)
            : ([group(p1), group(p2), group(q2), group(q1)] as const),
        ),
      prefer: (a, b) => middle[a]! < middle[b]! || (middle[a] === middle[b] && a < b),
      budget: SEARCH_BUDGET,
    });
    if (!solved) {
      if (report) report.guessed++;
      continue;
    }
    for (const [lower, upper] of solved) order(lower, upper);
  }
}

function modelExtent(planes: ReadonlyArray<Plane | undefined>): number {
  let extent = 0;
  for (const plane of planes) {
    if (plane) for (let k = 0; k < 3; k++) extent = Math.max(extent, plane.max[k]! - plane.min[k]!);
  }
  return extent || 1;
}

/** Whether a segment in a face's plane passes through the face's inside, not just along its edge. */
function crossesInside(from: Vec, to: Vec, plane: Plane, tolerance: number): boolean {
  const segment: Array<[number, number, number]> = [
    [from[0], from[1], from[2]],
    [to[0], to[1], to[2]],
  ];
  const axes = plane.points.map((p, i) =>
    cross(plane.normal, sub(plane.points[(i + 1) % plane.points.length]!, p)),
  );
  axes.push(cross(plane.normal, sub(to, from)));
  for (const axis of axes) {
    const [aMin, aMax] = project(plane.points, axis);
    const [bMin, bMax] = project(segment, axis);
    // The segment has to reach into the face's open interval. Measuring the overlap's length
    // instead would miss every segment with no width along the axis: across itself, and along
    // any side of the face it runs parallel to.
    const margin = tolerance * Math.hypot(...axis);
    if (bMax <= aMin + margin || bMin >= aMax - margin) return false;
  }
  return true;
}

/**
 * Longest-path heights over the groups, in topological order: the lowest that put every group a
 * sheet above those it must be above. Linear in the number of constraints, however deep the stack.
 * A cycle can only come from assignments that contradict each other; its groups keep the heights
 * reached so far.
 */
function lowestHeights(
  above: ReadonlyArray<readonly [from: number, to: number]>,
  count: number,
): Int32Array {
  const heights = new Int32Array(count);
  const waiting = new Int32Array(count);
  const next: number[][] = Array.from({ length: count }, () => []);
  for (const [from, to] of above) {
    next[from]!.push(to);
    waiting[to]!++;
  }
  const ready: number[] = [];
  for (let g = 0; g < count; g++) if (waiting[g] === 0) ready.push(g);
  while (ready.length > 0) {
    const g = ready.pop()!;
    for (const to of next[g]!) {
      heights[to] = Math.max(heights[to]!, heights[g]! + 1);
      if (--waiting[to]! === 0) ready.push(to);
    }
  }
  return heights;
}

/**
 * The lowest heights can still leave two groups that meet at a vertex many sheets apart, when
 * nothing ties them to each other: each is only as high as its own longest chain. Here each group
 * moves towards the height its neighbours suggest, but only within the range its constraints leave
 * it, so every fold stays on the right side.
 */
function compact(
  heights: Int32Array,
  above: ReadonlyArray<readonly [from: number, to: number]>,
  count: number,
): void {
  const lower: number[][] = Array.from({ length: count }, () => []);
  const upper: number[][] = Array.from({ length: count }, () => []);
  for (const [from, to] of above) {
    lower[to]!.push(from);
    upper[from]!.push(to);
  }
  for (let pass = 0; pass < 50; pass++) {
    let moved = false;
    for (let g = 0; g < count; g++) {
      const count = lower[g]!.length + upper[g]!.length;
      if (count === 0) continue;
      let low = -Infinity;
      let high = Infinity;
      let sum = 0;
      for (const h of lower[g]!) {
        low = Math.max(low, heights[h]! + 1);
        sum += heights[h]! + 1;
      }
      for (const h of upper[g]!) {
        high = Math.min(high, heights[h]! - 1);
        sum += heights[h]! - 1;
      }
      if (low > high) continue;
      const target = Math.min(Math.max(Math.round(sum / count), low), high);
      if (target !== heights[g]) {
        heights[g] = target;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

interface Plane {
  normal: [number, number, number];
  points: Array<[number, number, number]>;
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Pairs of faces lying in one plane whose insides overlap, with +1 if their normals agree and −1
 * if they are opposite. Faces are treated as convex, which at worst orders a pair that only
 * overlaps the other's hull.
 */
function overlappingPairs(
  model: ResolvedModel,
  coords: Float64Array,
): { pairs: Array<[number, number, 1 | -1]>; planes: Array<Plane | undefined> } {
  const planes: Array<Plane | undefined> = model.facesVertices.map((face) => {
    const points = face.map(
      (v) => [coords[3 * v]!, coords[3 * v + 1]!, coords[3 * v + 2]!] as [number, number, number],
    );
    let nx = 0;
    let ny = 0;
    let nz = 0;
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length]!;
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    });
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) return undefined;
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const p of points) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, p[k]!);
        max[k] = Math.max(max[k]!, p[k]!);
      }
    }
    return { normal: [nx / length, ny / length, nz / length], points, min, max };
  });

  let extent = 0;
  for (const plane of planes) {
    if (plane) for (let k = 0; k < 3; k++) extent = Math.max(extent, plane.max[k]! - plane.min[k]!);
  }
  const tolerance = 1e-7 * (extent || 1);

  // Sweep along x so only faces whose boxes meet are compared.
  const order = planes
    .map((plane, f) => [f, plane] as const)
    .filter((entry): entry is readonly [number, Plane] => entry[1] !== undefined)
    .sort((a, b) => a[1].min[0] - b[1].min[0]);
  const pairs: Array<[number, number, 1 | -1]> = [];
  let budget = OVERLAP_BUDGET;
  for (let i = 0; i < order.length; i++) {
    const [a, pa] = order[i]!;
    for (let j = i + 1; j < order.length; j++) {
      if (--budget < 0) return { pairs, planes };
      const [b, pb] = order[j]!;
      // Boxes only rule out faces clearly apart: a face square to an axis has no width along it.
      if (pb.min[0] > pa.max[0] + tolerance) break;
      if (pb.min[1] > pa.max[1] + tolerance || pa.min[1] > pb.max[1] + tolerance) continue;
      if (pb.min[2] > pa.max[2] + tolerance || pa.min[2] > pb.max[2] + tolerance) continue;
      const alignment = dot(pa.normal, pb.normal);
      if (Math.abs(alignment) < 1 - 1e-9) continue;
      if (Math.abs(dot(pa.normal, sub(pb.points[0]!, pa.points[0]!))) > tolerance) continue;
      if (!insidesOverlap(pa, pb, tolerance)) continue;
      pairs.push(a < b ? [a, b, alignment > 0 ? 1 : -1] : [b, a, alignment > 0 ? 1 : -1]);
    }
  }
  return { pairs, planes };
}

/** Separating-axis test in the faces' shared plane, requiring more than a touch to count. */
function insidesOverlap(a: Plane, b: Plane, tolerance: number): boolean {
  for (const polygon of [a.points, b.points]) {
    for (let i = 0; i < polygon.length; i++) {
      const edge = sub(polygon[(i + 1) % polygon.length]!, polygon[i]!);
      const axis = cross(a.normal, edge);
      const [aMin, aMax] = project(a.points, axis);
      const [bMin, bMax] = project(b.points, axis);
      const scale = Math.hypot(...axis);
      if (Math.min(aMax, bMax) - Math.max(aMin, bMin) <= tolerance * scale) return false;
    }
  }
  return true;
}

function project(points: ReadonlyArray<[number, number, number]>, axis: [number, number, number]) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const value = dot(p, axis);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max] as const;
}

type Vec = readonly [number, number, number];

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: Vec, b: Vec): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec, b: Vec): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** A crease folded flat, with the face below and the face above it in the stack. */
interface Taco {
  edge: number;
  lower: number;
  upper: number;
}

/**
 * Where the paper turns the same corner twice, like both layers of a box's wall bending onto its
 * floor: two bends along one line, the faces on one side of them overlapping in one plane (p1 and
 * p2) and those on the other side in another (q1 and q2). The bends cannot cross, so whichever is
 * inside on one side of the corner is inside on the other: p2 is nearer the q side than p1 exactly
 * when q2 is nearer the p side than q1. `same` says whether that makes "p2 above p1" and "q2 above
 * q1", in each stack's own direction of height, true together or opposite.
 */
function nestedBends(
  model: ResolvedModel,
  coords: Float64Array,
  overlaps: ReadonlyArray<readonly [number, number, 1 | -1]>,
  planes: ReadonlyArray<Plane | undefined>,
  bends: readonly number[],
  facing: Int8Array,
): Array<{ p1: number; p2: number; q1: number; q2: number; same: boolean }> {
  const overlapping = new Set<string>();
  const stacked = new Set<number>();
  for (const [a, b] of overlaps) {
    overlapping.add(`${a},${b}`).add(`${b},${a}`);
    stacked.add(a).add(b);
  }
  const overlap = (a: number, b: number) => overlapping.has(`${a},${b}`);
  const point = (v: number): Vec => [coords[3 * v]!, coords[3 * v + 1]!, coords[3 * v + 2]!];
  const centroid = (f: number): Vec => {
    const face = model.facesVertices[f]!;
    const sum = [0, 0, 0];
    for (const v of face) for (let k = 0; k < 3; k++) sum[k]! += coords[3 * v + k]!;
    return [sum[0]! / face.length, sum[1]! / face.length, sum[2]! / face.length];
  };
  // Only bends with a face in some stack can take part.
  const candidates = bends.filter((edge) =>
    model.edgesFaces[edge]!.every((face) => stacked.has(face)),
  );
  const tolerance = 1e-7 * modelExtent(planes);
  /** +1 if the stack's height rises towards where `other` lies from face `f`'s plane. */
  const towards = (f: number, other: number, on: Vec): number =>
    facing[f]! * Math.sign(dot(sub(centroid(other), on), planes[f]!.normal));

  const found: Array<{ p1: number; p2: number; q1: number; q2: number; same: boolean }> = [];
  let budget = OVERLAP_BUDGET;
  for (let i = 0; i < candidates.length; i++) {
    const e1 = candidates[i]!;
    const [u1, v1] = model.edgesVertices[e1]!;
    const [a1, b1] = model.edgesFaces[e1]! as [number, number];
    for (let j = i + 1; j < candidates.length; j++) {
      if (--budget < 0) return found;
      const e2 = candidates[j]!;
      const [u2, v2] = model.edgesVertices[e2]!;
      if (!sharesLength(point(u1), point(v1), point(u2), point(v2), tolerance)) continue;
      const [a2, b2] = model.edgesFaces[e2]! as [number, number];
      let pair: [number, number, number, number] | undefined;
      if (overlap(a1, a2) && overlap(b1, b2)) pair = [a1, a2, b1, b2];
      else if (overlap(a1, b2) && overlap(b1, a2)) pair = [a1, b2, b1, a2];
      if (!pair) continue;
      const [p1, p2, q1, q2] = pair;
      if (!planes[p1] || !planes[q1]) continue;
      const on = point(u1);
      const same = towards(p1, q1, on) === towards(q1, p1, on);
      found.push({ p1, p2, q1, q2, same });
    }
  }
  return found;
}

/**
 * Pairs of flat folds lying along one line in the folded model, with their faces on the same side
 * of it, so that one fold's layers could wrap round the other's.
 */
function coincidentFolds(
  model: ResolvedModel,
  coords: Float64Array,
  tacos: readonly Taco[],
): Array<[Taco, Taco]> {
  const point = (v: number): Vec => [coords[3 * v]!, coords[3 * v + 1]!, coords[3 * v + 2]!];
  const centroid = (f: number): Vec => {
    const face = model.facesVertices[f]!;
    const sum = [0, 0, 0];
    for (const v of face) for (let k = 0; k < 3; k++) sum[k]! += coords[3 * v + k]!;
    return [sum[0]! / face.length, sum[1]! / face.length, sum[2]! / face.length];
  };
  const lines = tacos.map((taco) => {
    const [u, v] = model.edgesVertices[taco.edge]!;
    const start = point(u);
    const along = sub(point(v), start);
    const length = Math.hypot(...along);
    const direction: Vec = [along[0] / length, along[1] / length, along[2] / length];
    // Which way from the line the fold's faces lie.
    const offset = sub(centroid(taco.lower), start);
    const out = sub(offset, scale(direction, dot(offset, direction)));
    return { start, direction, length, out };
  });

  let extent = 0;
  for (const line of lines) extent = Math.max(extent, line.length);
  const tolerance = 1e-7 * (extent || 1);

  const pairs: Array<[Taco, Taco]> = [];
  let budget = OVERLAP_BUDGET;
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i]!;
    for (let j = i + 1; j < lines.length; j++) {
      if (--budget < 0) return pairs;
      const b = lines[j]!;
      if (Math.abs(Math.abs(dot(a.direction, b.direction)) - 1) > 1e-9) continue;
      const gap = sub(b.start, a.start);
      const across = sub(gap, scale(a.direction, dot(gap, a.direction)));
      if (Math.hypot(...across) > tolerance) continue;
      // The two segments must share some length, not just touch.
      const from = dot(gap, a.direction);
      const to = from + b.length * dot(b.direction, a.direction);
      if (Math.min(a.length, Math.max(from, to)) - Math.max(0, Math.min(from, to)) <= tolerance) {
        continue;
      }
      if (dot(a.out, b.out) <= 0) continue;
      pairs.push([tacos[i]!, tacos[j]!]);
    }
  }
  return pairs;
}

/** Whether two segments lie along one line and share some length, not just a point. */
function sharesLength(a0: Vec, a1: Vec, b0: Vec, b1: Vec, tolerance: number): boolean {
  const along = sub(a1, a0);
  const length = Math.hypot(...along);
  const direction = scale(along, 1 / length);
  const offsets = [sub(b0, a0), sub(b1, a0)];
  for (const offset of offsets) {
    const across = sub(offset, scale(direction, dot(offset, direction)));
    if (Math.hypot(...across) > tolerance) return false;
  }
  const [from, to] = offsets.map((offset) => dot(offset, direction)) as [number, number];
  return Math.min(length, Math.max(from, to)) - Math.max(0, Math.min(from, to)) > tolerance;
}

function scale(a: Vec, k: number): [number, number, number] {
  return [a[0] * k, a[1] * k, a[2] * k];
}
