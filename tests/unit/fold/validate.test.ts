import { describe, expect, it } from "vitest";
import type { RawFrame, ResolvedRawFrame } from "@/fold/types";
import { validateFrames, validateRawFrames } from "@/fold/validate";

const square: RawFrame = {
  vertices_coords: [
    [0, 0],
    [0.5, 0],
    [1, 0],
    [1, 1],
    [0.5, 1],
    [0, 1],
  ],
  edges_vertices: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 0],
    [1, 4],
  ],
  edges_assignment: ["B", "B", "B", "B", "B", "B", "U"],
  faces_vertices: [
    [0, 1, 4, 5],
    [1, 2, 3, 4],
  ],
};

function frames(...fields: RawFrame[]): ResolvedRawFrame[] {
  return fields.map((f, index) => ({
    index,
    parentIndex: index === 0 ? null : index - 1,
    fields: f,
  }));
}

function firstError(input: ResolvedRawFrame[]) {
  const result = validateFrames(input);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors[0]!;
}

function valid(input: ResolvedRawFrame[]) {
  const result = validateFrames(input);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("; "));
  return result.frames;
}

describe("validateRawFrames", () => {
  it("rejects fewer than two frames", () => {
    const errors = validateRawFrames([square]);
    expect(errors.map((e) => e.code)).toEqual(["TOO_FEW_FRAMES"]);
    expect(errors[0]!.message).toMatch(/at least two frames/i);
  });

  it("rejects a frame with no vertices_coords of its own, naming the frame", () => {
    const errors = validateRawFrames([square, { frame_parent: 0, frame_inherit: true }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("MISSING_VERTICES_COORDS");
    expect(errors[0]!.frameIndex).toBe(1);
    expect(errors[0]!.message).toContain("Frame 1");
  });

  it("reports one error per offending frame", () => {
    const errors = validateRawFrames([{}, {}, square]);
    expect(errors.map((e) => e.frameIndex)).toEqual([0, 1]);
  });

  it("accepts two frames that both carry coordinates", () => {
    expect(validateRawFrames([square, { ...square }])).toEqual([]);
  });
});

describe("validateFrames: shape of a single frame", () => {
  it("expands 2D coordinates to z = 0 and keeps 3D coordinates", () => {
    const [f0, f1] = valid(
      frames(square, {
        ...square,
        // The square's right half stood up 90° about the crease: a real fold, so it also passes
        // the edge-length check.
        vertices_coords: [
          [0, 0, 0],
          [0.5, 0, 0],
          [0.5, 0, 0.5],
          [0.5, 1, 0.5],
          [0.5, 1, 0],
          [0, 1, 0],
        ],
      }),
    );
    // Frame 0 is written in 2D and gains z = 0.
    expect(Array.from(f0!.coords.slice(0, 6))).toEqual([0, 0, 0, 0.5, 0, 0]);
    // Frame 1's third vertex keeps the height it was given.
    expect(Array.from(f1!.coords.slice(6, 9))).toEqual([0.5, 0, 0.5]);
    expect(f1!.coords).toBeInstanceOf(Float64Array);
  });

  it.each([
    ["not an array", "nope"],
    [
      "a vertex with four numbers",
      [
        [0, 0, 0, 0],
        [1, 0],
        [1, 1],
      ],
    ],
    ["a vertex with one number", [[0], [1, 0], [1, 1]]],
    [
      "a non-numeric coordinate",
      [
        [0, "0"],
        [1, 0],
        [1, 1],
      ],
    ],
    [
      "a non-finite coordinate",
      [
        [0, Number.NaN],
        [1, 0],
        [1, 1],
      ],
    ],
  ])("rejects vertices_coords that is %s with BAD_COORDS", (_label, coords) => {
    const error = firstError(frames(square, { ...square, vertices_coords: coords }));
    expect(error.code).toBe("BAD_COORDS");
    expect(error.frameIndex).toBe(1);
  });

  it("rejects a resolved frame without edges_vertices or faces_vertices", () => {
    const noEdges = { ...square } as RawFrame;
    delete noEdges.edges_vertices;
    expect(firstError(frames(square, noEdges)).code).toBe("MISSING_EDGES_VERTICES");
    const noFaces = { ...square } as RawFrame;
    delete noFaces.faces_vertices;
    const error = firstError(frames(square, noFaces));
    expect(error.code).toBe("MISSING_FACES_VERTICES");
    expect(error.message).toContain("Frame 1");
  });

  it.each([
    ["a non-pair", [[0, 1, 2]]],
    ["a vertex index out of range", [[0, 6]]],
    ["a negative index", [[0, -1]]],
    ["a non-integer index", [[0, 1.5]]],
  ])("rejects edges_vertices containing %s with BAD_EDGES", (_label, edges) => {
    expect(firstError(frames({ ...square, edges_vertices: edges }, square)).code).toBe("BAD_EDGES");
  });

  it.each([
    ["a face with two vertices", [[0, 1]]],
    ["a vertex index out of range", [[0, 1, 9]]],
    ["a non-integer index", [[0, 1, 1.5]]],
  ])("rejects faces_vertices containing %s with BAD_FACES", (_label, faces) => {
    expect(firstError(frames({ ...square, faces_vertices: faces }, square)).code).toBe("BAD_FACES");
  });

  it("defaults a missing edges_assignment to all U", () => {
    const withoutAssignments = { ...square } as RawFrame;
    delete withoutAssignments.edges_assignment;
    const [f0] = valid(frames(withoutAssignments, square));
    expect(f0!.assignments).toEqual(["U", "U", "U", "U", "U", "U", "U"]);
  });

  it.each([
    ["the wrong length", ["B", "B"]],
    ["an unknown letter", ["B", "B", "B", "B", "B", "B", "X"]],
    ["a non-string", ["B", "B", "B", "B", "B", "B", 1]],
  ])("rejects edges_assignment with %s with BAD_ASSIGNMENT", (_label, assignment) => {
    const error = firstError(frames(square, { ...square, edges_assignment: assignment }));
    expect(error.code).toBe("BAD_ASSIGNMENT");
    expect(error.frameIndex).toBe(1);
  });

  it("accepts every FOLD assignment letter", () => {
    const [f0] = valid(
      frames({ ...square, edges_assignment: ["B", "M", "V", "F", "U", "C", "J"] }, square),
    );
    expect(f0!.assignments).toEqual(["B", "M", "V", "F", "U", "C", "J"]);
  });

  it("extracts string titles and descriptions and ignores other types", () => {
    const [f0, f1] = valid(
      frames(
        { ...square, frame_title: "Flat", frame_description: 42 },
        { ...square, frame_title: ["x"] },
      ),
    );
    expect(f0!.title).toBe("Flat");
    expect(f0!.description).toBeUndefined();
    expect(f1!.title).toBeUndefined();
  });

  it("keeps a numeric edges_foldAngle as a hint and ignores a malformed one", () => {
    const [f0, f1] = valid(
      frames(
        { ...square, edges_foldAngle: [0, 0, 0, 0, 0, 0, 180] },
        { ...square, edges_foldAngle: ["a"] },
      ),
    );
    expect(f0!.foldAngleHints).toEqual([0, 0, 0, 0, 0, 0, 180]);
    expect(f1!.foldAngleHints).toBeUndefined();
  });

  it("carries index and parentIndex through", () => {
    const [f0, f1] = valid(frames(square, square));
    expect([f0!.index, f0!.parentIndex, f1!.index, f1!.parentIndex]).toEqual([0, null, 1, 0]);
  });
});

describe("validateFrames: consistency with frame 0", () => {
  it("rejects a vertex count change, naming both counts", () => {
    const error = firstError(
      frames(square, {
        ...square,
        vertices_coords: [...(square.vertices_coords as number[][]), [0.5, 0.5]],
      }),
    );
    expect(error.code).toBe("VERTEX_COUNT_MISMATCH");
    expect(error.frameIndex).toBe(1);
    expect(error.message).toContain("7");
    expect(error.message).toContain("6");
  });

  it("rejects a change in faces_vertices, naming the array", () => {
    const error = firstError(
      frames(square, {
        ...square,
        faces_vertices: [
          [0, 1, 4, 5],
          [1, 2, 3, 4],
          [0, 1, 2],
        ],
      }),
    );
    expect(error.code).toBe("TOPOLOGY_MISMATCH");
    expect(error.message).toContain("faces_vertices");
    expect(error.message).toContain("Frame 1");
  });

  it("rejects reordered edges_vertices (strict equality), naming the array", () => {
    const error = firstError(
      frames(square, {
        ...square,
        edges_vertices: [
          [1, 4],
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
          [5, 0],
        ],
        edges_assignment: ["U", "B", "B", "B", "B", "B", "B"],
      }),
    );
    expect(error.code).toBe("TOPOLOGY_MISMATCH");
    expect(error.message).toContain("edges_vertices");
  });

  it("rejects a frame whose edge lengths differ from frame 0, naming the edge", () => {
    // Paper does not stretch: a later frame has to be the same sheet, folded.
    const error = firstError(
      frames(square, {
        ...square,
        vertices_coords: [
          [0, 0, 0],
          [0.5, 0, 0],
          [0, 0, 0],
          [0, 1, 0],
          [0.5, 1, 0],
          [0, 0, 0],
        ],
      }),
    );
    expect(error.code).toBe("EDGE_LENGTH_MISMATCH");
    expect(error.frameIndex).toBe(1);
    expect(error.message).toContain("Frame 1");
    expect(error.message).toMatch(/edge \d+/);
  });

  it("allows the small edge-length drift a simulator's export carries", () => {
    const drifted = (square.vertices_coords as number[][]).map((v) => [v[0]! * 1.005, v[1]!, 0]);
    expect(validateFrames(frames(square, { ...square, vertices_coords: drifted })).ok).toBe(true);
  });

  it("rejects a stretch beyond the tolerance", () => {
    const stretched = (square.vertices_coords as number[][]).map((v) => [v[0]! * 1.05, v[1]!, 0]);
    const error = firstError(frames(square, { ...square, vertices_coords: stretched }));
    expect(error.code).toBe("EDGE_LENGTH_MISMATCH");
  });

  it("ignores an edge that has no length in frame 0", () => {
    const degenerate = {
      ...square,
      vertices_coords: [
        [0, 0],
        [0, 0],
        [1, 0],
        [1, 1],
        [0.5, 1],
        [0, 1],
      ],
    };
    // Edge 0 joins two coincident vertices, so there is no rest length to compare against.
    expect(validateFrames(frames(degenerate, degenerate)).ok).toBe(true);
  });

  it("reports at most one error per frame and one for each bad frame", () => {
    const result = validateFrames(
      frames(
        square,
        { ...square, vertices_coords: "bad", faces_vertices: [] },
        { ...square, edges_assignment: ["X"] },
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.frameIndex)).toEqual([1, 2]);
  });
});
