import { describe, expect, it } from "vitest";
import { computeFoldAngles, faceNormal } from "@/fold/geometry";
import type { Assignment, Topology } from "@/fold/types";

/**
 * A single hinge: edge (v0, v1) along +y, face A = [0, 1, 2] on the −x side, face B = [1, 0, 3]
 * on the +x side. Both faces are counter-clockwise from +z when flat. Rotating v3 about the edge
 * by φ towards +z gives v3 = (cos φ, 0.5, sin φ).
 */
const hinge: Topology = {
  vertexCount: 4,
  edgesVertices: [
    [0, 1],
    [1, 2],
    [2, 0],
    [0, 3],
    [3, 1],
  ],
  facesVertices: [
    [0, 1, 2],
    [1, 0, 3],
  ],
  edgesFaces: [[0, 1], [0], [0], [1], [1]],
  facesEdges: [
    [0, 1, 2],
    [0, 3, 4],
  ],
};

function hingeCoords(phiDeg: number, movingFace: "A" | "B" = "B"): Float64Array {
  const phi = (phiDeg * Math.PI) / 180;
  const v2 = movingFace === "A" ? [-Math.cos(phi), 0.5, Math.sin(phi)] : [-1, 0.5, 0];
  const v3 = movingFace === "B" ? [Math.cos(phi), 0.5, Math.sin(phi)] : [1, 0.5, 0];
  return new Float64Array([0, 0, 0, 0, 1, 0, ...v2, ...v3]);
}

const unassigned: Assignment[] = ["U", "B", "B", "B", "B"];

describe("faceNormal (Newell)", () => {
  it("returns +z for a counter-clockwise flat face and −z for a clockwise one", () => {
    const coords = new Float64Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    expect(faceNormal(coords, [0, 1, 2, 3])).toEqual([0, 0, 1]);
    expect(faceNormal(coords, [3, 2, 1, 0])).toEqual([0, 0, -1]);
  });

  it("handles a quad that is not perfectly planar by averaging", () => {
    const coords = new Float64Array([0, 0, 0, 1, 0, 0, 1, 1, 0.01, 0, 1, 0]);
    const [x, y, z] = faceNormal(coords, [0, 1, 2, 3]);
    expect(z).toBeGreaterThan(0.99);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
  });
});

describe("computeFoldAngles", () => {
  it("is 0 for a flat hinge and NaN for boundary edges", () => {
    const angles = computeFoldAngles(hingeCoords(0), hinge, unassigned);
    expect(angles[0]).toBeCloseTo(0, 12);
    expect(Array.from(angles.slice(1)).every(Number.isNaN)).toBe(true);
  });

  it.each([30, 90, 135, -30, -90, -135])(
    "reports %s° when face B rotates by that angle towards +z (valley positive)",
    (phi) => {
      expect(computeFoldAngles(hingeCoords(phi), hinge, unassigned)[0]).toBeCloseTo(phi, 9);
    },
  );

  it("gives the same angle whichever face moved", () => {
    expect(computeFoldAngles(hingeCoords(60, "A"), hinge, unassigned)[0]).toBeCloseTo(60, 9);
    expect(computeFoldAngles(hingeCoords(-60, "A"), hinge, unassigned)[0]).toBeCloseTo(-60, 9);
  });

  it("takes the sign from the assignment when the hinge is folded flat (±180°)", () => {
    const flat = hingeCoords(180);
    expect(computeFoldAngles(flat, hinge, ["V", "B", "B", "B", "B"])[0]).toBeCloseTo(180, 9);
    expect(computeFoldAngles(flat, hinge, ["M", "B", "B", "B", "B"])[0]).toBeCloseTo(-180, 9);
    // Unassigned or flat creases folded flat are reported as +180.
    expect(computeFoldAngles(flat, hinge, unassigned)[0]).toBeCloseTo(180, 9);
  });

  it("does not let the assignment override a measurable sign", () => {
    expect(computeFoldAngles(hingeCoords(90), hinge, ["M", "B", "B", "B", "B"])[0]).toBeCloseTo(
      90,
      9,
    );
  });

  it("returns one entry per edge as a Float64Array", () => {
    const angles = computeFoldAngles(hingeCoords(0), hinge, unassigned);
    expect(angles).toBeInstanceOf(Float64Array);
    expect(angles).toHaveLength(5);
  });
});
