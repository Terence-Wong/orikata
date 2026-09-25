import { describe, expect, it } from "vitest";
import { solveFlatOrder, type FlatOrderProblem, type FlatTaco } from "@/viewer/flatOrder";

/** Every pair of the given indices overlaps. */
function allPairs(indices: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < indices.length; i++) {
    for (let j = i + 1; j < indices.length; j++) pairs.push([indices[i]!, indices[j]!]);
  }
  return pairs;
}

function problem(parts: Partial<FlatOrderProblem> & { count: number }): FlatOrderProblem {
  return {
    overlaps: allPairs([...Array(parts.count).keys()]),
    tacos: [],
    tacoTaco: [],
    tacoTortilla: [],
    prefer: (a, b) => a < b,
    budget: 10_000,
    ...parts,
  };
}

/** Heights from pairwise orders, which the solver guarantees are consistent. */
function stackOrder(pairs: Array<[number, number]>, count: number): number[] {
  const below = Array.from(
    { length: count },
    (_, g) => pairs.filter(([lower, upper]) => upper === g && lower !== g).length,
  );
  return [...Array(count).keys()].sort((a, b) => below[a]! - below[b]!);
}

describe("solveFlatOrder", () => {
  it("keeps each fold's faces in the order its crease says", () => {
    const tacos: FlatTaco[] = [{ lower: 1, upper: 0 }];
    const pairs = solveFlatOrder(problem({ count: 2, tacos }))!;
    expect(pairs).toEqual([[1, 0]]);
  });

  it("never interleaves two folds along one line", () => {
    const one: FlatTaco = { lower: 0, upper: 1 };
    const two: FlatTaco = { lower: 2, upper: 3 };
    // Preferring the lower index below would give 0 < 1 < 2 < 3 (apart) — allowed — so push it
    // towards interleaving instead: 0 < 2 < 1 < 3.
    const rank = [0, 2, 1, 3];
    const pairs = solveFlatOrder(
      problem({
        count: 4,
        tacos: [one, two],
        tacoTaco: [[one, two]],
        prefer: (a, b) => rank[a]! < rank[b]!,
      }),
    )!;
    const order = stackOrder(pairs, 4);
    const at = (g: number) => order.indexOf(g);
    const inside = (x: number) => at(one.lower) < at(x) && at(x) < at(one.upper);
    expect(inside(two.lower)).toBe(inside(two.upper));
  });

  it("keeps a face that a fold's line crosses out from between that fold's faces", () => {
    const fold: FlatTaco = { lower: 0, upper: 1 };
    const pairs = solveFlatOrder(
      problem({
        count: 3,
        tacos: [fold],
        tacoTortilla: [[2, fold]],
        // Left to itself it would slide the crossed face in between.
        prefer: (a, b) => [0, 2, 1].indexOf(a) < [0, 2, 1].indexOf(b),
      }),
    )!;
    const order = stackOrder(pairs, 3);
    expect(order.indexOf(2) === 1).toBe(false);
  });

  it("orders overlapping faces transitively", () => {
    const pairs = solveFlatOrder(
      problem({
        count: 3,
        tacos: [
          { lower: 0, upper: 1 },
          { lower: 1, upper: 2 },
        ],
      }),
    )!;
    expect(pairs).toContainEqual([0, 2]);
  });

  it("reports rules that cannot all hold", () => {
    const tacos: FlatTaco[] = [
      { lower: 0, upper: 1 },
      { lower: 1, upper: 2 },
      { lower: 2, upper: 0 },
    ];
    expect(solveFlatOrder(problem({ count: 3, tacos }))).toBeUndefined();
  });
});
