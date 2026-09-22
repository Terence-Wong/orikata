import { describe, expect, it } from "vitest";
import { resolveFrames, splitFrames } from "@/fold/frames";
import type { RawFrame } from "@/fold/types";

const geometry = {
  vertices_coords: [
    [0, 0],
    [1, 0],
    [1, 1],
  ],
  edges_vertices: [
    [0, 1],
    [1, 2],
    [2, 0],
  ],
  edges_assignment: ["B", "B", "B"],
  faces_vertices: [[0, 1, 2]],
};

function resolved(frames: RawFrame[]) {
  const result = resolveFrames(frames);
  if (!result.ok) throw new Error(result.error.message);
  return result.frames;
}

describe("splitFrames", () => {
  it("makes frame 0 from the top-level fields without file_* keys or file_frames", () => {
    const frames = splitFrames({
      file_spec: 1.1,
      file_title: "T",
      frame_title: "Flat",
      ...geometry,
      file_frames: [{ frame_parent: 0, frame_inherit: true, vertices_coords: [] }],
    });
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ frame_title: "Flat", ...geometry });
    expect(frames[1]).toEqual({ frame_parent: 0, frame_inherit: true, vertices_coords: [] });
  });

  it("returns a single frame when file_frames is absent", () => {
    expect(splitFrames({ ...geometry })).toHaveLength(1);
  });

  it("ignores file_frames entries that are not objects", () => {
    // Malformed entries are reported by validation, not silently treated as frames.
    expect(splitFrames({ ...geometry, file_frames: "nope" })).toHaveLength(1);
  });
});

describe("resolveFrames", () => {
  it("copies fields from the parent when frame_inherit is true, overriding with the frame's own", () => {
    const frames = resolved([
      { ...geometry },
      { frame_parent: 0, frame_inherit: true, edges_assignment: ["B", "B", "V"] },
    ]);
    expect(frames[1]!.fields.vertices_coords).toEqual(geometry.vertices_coords);
    expect(frames[1]!.fields.faces_vertices).toEqual(geometry.faces_vertices);
    expect(frames[1]!.fields.edges_assignment).toEqual(["B", "B", "V"]);
  });

  it("resolves a grandparent chain", () => {
    const frames = resolved([
      { ...geometry },
      { frame_parent: 0, frame_inherit: true, edges_assignment: ["B", "B", "V"] },
      {
        frame_parent: 1,
        frame_inherit: true,
        vertices_coords: [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 1],
        ],
      },
    ]);
    expect(frames[2]!.fields.edges_assignment).toEqual(["B", "B", "V"]);
    expect(frames[2]!.fields.faces_vertices).toEqual(geometry.faces_vertices);
    expect(frames[2]!.fields.vertices_coords).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 1],
    ]);
  });

  it("resolves out of order: a child may be listed before its parent", () => {
    const frames = resolved([
      { ...geometry },
      { frame_parent: 2, frame_inherit: true, edges_assignment: ["B", "B", "M"] },
      {
        frame_parent: 0,
        frame_inherit: true,
        vertices_coords: [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 1],
        ],
      },
    ]);
    expect(frames[1]!.fields.vertices_coords).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 1],
    ]);
    expect(frames[1]!.fields.edges_assignment).toEqual(["B", "B", "M"]);
  });

  it("does not inherit frame_* metadata (title, description, author, classes, attributes)", () => {
    const frames = resolved([
      {
        frame_title: "Flat",
        frame_description: "The crease pattern",
        frame_author: "A",
        frame_classes: ["creasePattern"],
        frame_attributes: ["2D"],
        ...geometry,
      },
      { frame_parent: 0, frame_inherit: true, frame_title: "Folded" },
      { frame_parent: 1, frame_inherit: true },
    ]);
    expect(frames[1]!.fields.frame_title).toBe("Folded");
    expect(frames[1]!.fields).not.toHaveProperty("frame_description");
    expect(frames[1]!.fields).not.toHaveProperty("frame_author");
    expect(frames[1]!.fields).not.toHaveProperty("frame_classes");
    expect(frames[1]!.fields).not.toHaveProperty("frame_attributes");
    expect(frames[2]!.fields).not.toHaveProperty("frame_title");
  });

  it("does not copy anything when frame_inherit is false or absent", () => {
    const frames = resolved([
      { ...geometry },
      { frame_parent: 0, frame_inherit: false, vertices_coords: [] },
      { frame_parent: 0, vertices_coords: [] },
    ]);
    expect(frames[1]!.fields).not.toHaveProperty("edges_vertices");
    expect(frames[2]!.fields).not.toHaveProperty("edges_vertices");
  });

  it("strips frame_parent and frame_inherit from the resolved fields", () => {
    const frames = resolved([{ ...geometry }, { frame_parent: 0, frame_inherit: true }]);
    expect(frames[1]!.fields).not.toHaveProperty("frame_parent");
    expect(frames[1]!.fields).not.toHaveProperty("frame_inherit");
  });

  it("records parentIndex as frame_parent when given, otherwise the previous frame", () => {
    const frames = resolved([
      { ...geometry },
      { frame_parent: 0, frame_inherit: true },
      { ...geometry },
      { frame_parent: 0, frame_inherit: false, ...geometry },
    ]);
    expect(frames.map((f) => f.parentIndex)).toEqual([null, 0, 1, 0]);
  });

  it.each([
    ["out of range", 7],
    ["negative", -1],
    ["non-integer", 1.5],
    ["a string", "0"],
  ])("rejects a frame_parent that is %s with BAD_FRAME_PARENT", (_label, parent) => {
    const result = resolveFrames([{ ...geometry }, { frame_parent: parent, frame_inherit: true }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("BAD_FRAME_PARENT");
    expect(result.error.frameIndex).toBe(1);
    expect(result.error.message).toMatch(/frame 1/i);
  });

  it("rejects frame_inherit without a frame_parent", () => {
    const result = resolveFrames([{ ...geometry }, { frame_inherit: true }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BAD_FRAME_PARENT");
  });

  it("detects a two-frame inheritance cycle and names it", () => {
    const result = resolveFrames([
      { ...geometry },
      { frame_parent: 2, frame_inherit: true },
      { frame_parent: 1, frame_inherit: true },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INHERIT_CYCLE");
    expect(result.error.frameIndex).toBe(1);
    expect(result.error.message).toContain("1 → 2 → 1");
  });

  it("detects a frame inheriting from itself", () => {
    const result = resolveFrames([{ ...geometry }, { frame_parent: 1, frame_inherit: true }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INHERIT_CYCLE");
  });

  it("does not report a cycle for a diamond (two children sharing a parent)", () => {
    const frames = resolved([
      { ...geometry },
      { frame_parent: 0, frame_inherit: true },
      { frame_parent: 0, frame_inherit: true },
    ]);
    expect(frames).toHaveLength(3);
  });
});
