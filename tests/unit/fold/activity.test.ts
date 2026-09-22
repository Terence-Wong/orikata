import { describe, expect, it } from "vitest";
import { ACTIVE_ANGLE_THRESHOLD_DEG, newlyActiveEdges } from "@/fold/activity";
import type { Assignment } from "@/fold/types";

function frame(assignments: Assignment[], angles: number[]) {
  return { assignments, foldAngles: new Float64Array(angles) };
}

describe("newlyActiveEdges", () => {
  it("uses a 5° threshold", () => {
    expect(ACTIVE_ANGLE_THRESHOLD_DEG).toBe(5);
  });

  it("is empty when there is no parent and no previous frame", () => {
    expect(newlyActiveEdges(frame(["V"], [90]), null, null)).toEqual([]);
  });

  it("activates an edge whose assignment goes from U or F to M or V, even with no angle change", () => {
    const current = frame(["V", "M", "V", "M"], [0, 0, 0, 0]);
    const parent = frame(["U", "F", "M", "B"], [0, 0, 0, 0]);
    expect(newlyActiveEdges(current, parent, current)).toEqual([0, 1]);
  });

  it("activates an edge whose fold angle changes by more than the threshold", () => {
    const previous = frame(["V", "V", "V", "V"], [0, 0, 10, -10]);
    const current = frame(
      ["V", "V", "V", "V"],
      [ACTIVE_ANGLE_THRESHOLD_DEG, ACTIVE_ANGLE_THRESHOLD_DEG + 1e-9, 7, -16],
    );
    expect(newlyActiveEdges(current, current, previous)).toEqual([1, 3]);
  });

  it("does not wrap: +179° to −179° is a 358° change, not 2°", () => {
    const previous = frame(["V"], [179]);
    const current = frame(["M"], [-179]);
    expect(newlyActiveEdges(current, current, previous)).toEqual([0]);
  });

  it("ignores boundary edges (NaN angles)", () => {
    const previous = frame(["B", "B"], [Number.NaN, Number.NaN]);
    const current = frame(["B", "V"], [Number.NaN, Number.NaN]);
    expect(newlyActiveEdges(current, previous, previous)).toEqual([]);
  });

  it("reads assignments from the parent and angles from the previous frame", () => {
    const current = frame(["V", "V"], [0, 90]);
    const parent = frame(["U", "V"], [0, 90]); // edge 0 newly assigned relative to the parent
    const previous = frame(["V", "V"], [0, 0]); // edge 1 moved relative to the previous frame
    expect(newlyActiveEdges(current, parent, previous)).toEqual([0, 1]);
    // Swapping the roles changes the answer, proving each rule reads the right frame.
    expect(newlyActiveEdges(current, previous, parent)).toEqual([]);
  });

  it("returns sorted, de-duplicated edge ids when both rules fire on the same edge", () => {
    const current = frame(["V", "V", "V"], [180, 0, 180]);
    const parent = frame(["U", "U", "U"], [0, 0, 0]);
    const previous = frame(["U", "U", "U"], [0, 0, 0]);
    expect(newlyActiveEdges(current, parent, previous)).toEqual([0, 1, 2]);
  });
});
