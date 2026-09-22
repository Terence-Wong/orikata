import { describe, expect, it } from "vitest";
import { triangulateFaces } from "@/fold/triangulate";

/** Signed area in xy; positive when the triangle is counter-clockwise seen from +z. */
function signedArea(coords: Float64Array, [a, b, c]: readonly [number, number, number]): number {
  const ax = coords[3 * a]!;
  const ay = coords[3 * a + 1]!;
  return (
    ((coords[3 * b]! - ax) * (coords[3 * c + 1]! - ay) -
      (coords[3 * c]! - ax) * (coords[3 * b + 1]! - ay)) /
    2
  );
}

const squareCoords = new Float64Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);

describe("triangulateFaces", () => {
  it("leaves triangles alone and reports no facet creases", () => {
    const result = triangulateFaces(new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), [[0, 1, 2]]);
    expect(result.triangles).toEqual([[0, 1, 2]]);
    expect(result.trianglesFace).toEqual([0]);
    expect(result.facetCreases).toEqual([]);
  });

  it("splits a convex quad into two triangles with one facet crease", () => {
    const result = triangulateFaces(squareCoords, [[0, 1, 2, 3]]);
    expect(result.triangles).toHaveLength(2);
    expect(result.trianglesFace).toEqual([0, 0]);
    expect(result.facetCreases).toHaveLength(1);
    const [a, b] = result.facetCreases[0]!;
    // The diagonal joins two opposite corners of the square.
    expect([a, b].sort()).toEqual([0, 2].every((v) => [a, b].includes(v)) ? [0, 2] : [1, 3]);
  });

  it("produces n − 2 triangles for a polygon with n vertices", () => {
    const hexagon = new Float64Array(
      [0, 1, 2, 3, 4, 5].flatMap((i) => {
        const t = (i * Math.PI) / 3;
        return [Math.cos(t), Math.sin(t), 0];
      }),
    );
    const result = triangulateFaces(hexagon, [[0, 1, 2, 3, 4, 5]]);
    expect(result.triangles).toHaveLength(4);
    expect(result.facetCreases).toHaveLength(3);
  });

  it("keeps every triangle counter-clockwise, matching the face winding", () => {
    const result = triangulateFaces(squareCoords, [[0, 1, 2, 3]]);
    for (const triangle of result.triangles) {
      expect(signedArea(squareCoords, triangle)).toBeGreaterThan(0);
    }
  });

  it("triangulates a non-convex polygon without using the reflex diagonal", () => {
    // An L-shape: vertex 2 is reflex.
    const coords = new Float64Array([0, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0, 1, 2, 0, 0, 2, 0]);
    const result = triangulateFaces(coords, [[0, 1, 2, 3, 4, 5]]);
    expect(result.triangles).toHaveLength(4);
    for (const triangle of result.triangles) {
      expect(signedArea(coords, triangle)).toBeGreaterThan(0);
    }
    // 2–5 would cut through the notch and must not be chosen.
    const diagonals = result.facetCreases.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`);
    expect(diagonals).not.toContain("2-5");
  });

  it("numbers triangles per face and lists every facet crease once", () => {
    const coords = new Float64Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 2, 0, 0, 2, 1, 0]);
    const result = triangulateFaces(coords, [
      [0, 1, 2, 3],
      [1, 4, 5, 2],
    ]);
    expect(result.triangles).toHaveLength(4);
    expect(result.trianglesFace).toEqual([0, 0, 1, 1]);
    expect(result.facetCreases).toHaveLength(2);
  });
});
