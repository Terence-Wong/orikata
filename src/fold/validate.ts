import {
  ASSIGNMENTS,
  type Assignment,
  type FoldError,
  type RawFrame,
  type ResolvedRawFrame,
  type ValidatedFrame,
} from "./types";

/** Checks that apply to frames as written, before inheritance. */
export function validateRawFrames(frames: RawFrame[]): FoldError[] {
  if (frames.length < 2) {
    return [
      {
        code: "TOO_FEW_FRAMES",
        message: `A model needs at least two frames (the crease pattern plus one folded step); this file has ${frames.length}.`,
      },
    ];
  }
  const errors: FoldError[] = [];
  frames.forEach((frame, index) => {
    if (frame.vertices_coords === undefined) {
      errors.push({
        code: "MISSING_VERTICES_COORDS",
        frameIndex: index,
        message: `Frame ${index} has no vertices_coords. Every frame must give its own vertex coordinates.`,
      });
    }
  });
  return errors;
}

export type ValidateResult =
  { ok: true; frames: ValidatedFrame[] } | { ok: false; errors: FoldError[] };

/**
 * Types and checks each resolved frame, then checks every later frame against frame 0 (same
 * vertex count, identical `edges_vertices` and `faces_vertices`). At most one error per frame.
 */
export function validateFrames(frames: ResolvedRawFrame[]): ValidateResult {
  const errors: FoldError[] = [];
  const validated: (ValidatedFrame | undefined)[] = frames.map((frame) => {
    const result = validateFrameShape(frame);
    if ("error" in result) {
      errors.push(result.error);
      return undefined;
    }
    return result.frame;
  });

  const frame0 = validated[0];
  if (frame0) {
    for (let i = 1; i < validated.length; i++) {
      const frame = validated[i];
      if (!frame) continue;
      const error = compareWithFrame0(frame, frame0);
      if (error) {
        errors.push(error);
        validated[i] = undefined;
      }
    }
  }

  if (errors.length > 0) {
    errors.sort((a, b) => (a.frameIndex ?? -1) - (b.frameIndex ?? -1));
    return { ok: false, errors };
  }
  return { ok: true, frames: validated as ValidatedFrame[] };
}

function validateFrameShape(
  frame: ResolvedRawFrame,
): { frame: ValidatedFrame } | { error: FoldError } {
  const { index, parentIndex, fields } = frame;
  const fail = (code: FoldError["code"], message: string): { error: FoldError } => ({
    error: { code, frameIndex: index, message: `Frame ${index}: ${message}` },
  });

  if (fields.edges_vertices === undefined) {
    return fail(
      "MISSING_EDGES_VERTICES",
      "no edges_vertices after resolving inheritance. Add edges_vertices or inherit from a frame that has them.",
    );
  }
  if (fields.faces_vertices === undefined) {
    return fail(
      "MISSING_FACES_VERTICES",
      "no faces_vertices after resolving inheritance. Add faces_vertices or inherit from a frame that has them.",
    );
  }

  const coords = readCoords(fields.vertices_coords);
  if (typeof coords === "string") return fail("BAD_COORDS", coords);
  const vertexCount = coords.length / 3;

  const edgesVertices = readEdges(fields.edges_vertices, vertexCount);
  if (typeof edgesVertices === "string") return fail("BAD_EDGES", edgesVertices);

  const facesVertices = readFaces(fields.faces_vertices, vertexCount);
  if (typeof facesVertices === "string") return fail("BAD_FACES", facesVertices);

  const assignments = readAssignments(fields.edges_assignment, edgesVertices.length);
  if (typeof assignments === "string") return fail("BAD_ASSIGNMENT", assignments);

  return {
    frame: {
      index,
      parentIndex,
      title: optionalString(fields.frame_title),
      description: optionalString(fields.frame_description),
      coords,
      edgesVertices,
      facesVertices,
      assignments,
      foldAngleHints: readNumberArray(fields.edges_foldAngle, edgesVertices.length),
    },
  };
}

function compareWithFrame0(frame: ValidatedFrame, frame0: ValidatedFrame): FoldError | null {
  const count = frame.coords.length / 3;
  const count0 = frame0.coords.length / 3;
  if (count !== count0) {
    return {
      code: "VERTEX_COUNT_MISMATCH",
      frameIndex: frame.index,
      message: `Frame ${frame.index} has ${count} vertices but frame 0 has ${count0}. All frames must share the same vertices.`,
    };
  }
  for (const key of ["edges_vertices", "faces_vertices"] as const) {
    const a = key === "edges_vertices" ? frame.edgesVertices : frame.facesVertices;
    const b = key === "edges_vertices" ? frame0.edgesVertices : frame0.facesVertices;
    if (!sameIndexArrays(a, b)) {
      return {
        code: "TOPOLOGY_MISMATCH",
        frameIndex: frame.index,
        message: `Frame ${frame.index}: ${key} differs from frame 0. All frames must list exactly the same ${key === "edges_vertices" ? "edges" : "faces"} in the same order.`,
      };
    }
  }
  return null;
}

function sameIndexArrays(a: readonly (readonly number[])[], b: readonly (readonly number[])[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.length !== y.length) return false;
    for (let j = 0; j < x.length; j++) if (x[j] !== y[j]) return false;
  }
  return true;
}

/** Reads `vertices_coords` into an xyz-interleaved array; 2D vertices get z = 0. */
function readCoords(value: unknown): Float64Array | string {
  if (!Array.isArray(value))
    return "vertices_coords must be an array of [x, y] or [x, y, z] vertices.";
  const out = new Float64Array(value.length * 3);
  for (let i = 0; i < value.length; i++) {
    const v: unknown = value[i];
    if (!Array.isArray(v) || (v.length !== 2 && v.length !== 3)) {
      return `vertex ${i} in vertices_coords must have 2 or 3 coordinates.`;
    }
    for (let k = 0; k < 3; k++) {
      const c: unknown = k < v.length ? v[k] : 0;
      if (typeof c !== "number" || !Number.isFinite(c)) {
        return `vertex ${i} in vertices_coords has a non-numeric coordinate.`;
      }
      out[3 * i + k] = c;
    }
  }
  return out;
}

function readEdges(value: unknown, vertexCount: number): [number, number][] | string {
  if (!Array.isArray(value)) return "edges_vertices must be an array of [a, b] vertex pairs.";
  const out: [number, number][] = [];
  for (let i = 0; i < value.length; i++) {
    const e: unknown = value[i];
    if (!Array.isArray(e) || e.length !== 2)
      return `edge ${i} in edges_vertices must be a pair of vertex indices.`;
    const [a, b] = e as unknown[];
    if (!isIndex(a, vertexCount) || !isIndex(b, vertexCount)) {
      return `edge ${i} in edges_vertices refers to a vertex that does not exist (this frame has ${vertexCount} vertices).`;
    }
    out.push([a, b]);
  }
  return out;
}

function readFaces(value: unknown, vertexCount: number): number[][] | string {
  if (!Array.isArray(value)) return "faces_vertices must be an array of vertex-index lists.";
  const out: number[][] = [];
  for (let i = 0; i < value.length; i++) {
    const f: unknown = value[i];
    if (!Array.isArray(f) || f.length < 3)
      return `face ${i} in faces_vertices must list at least three vertices.`;
    const face: number[] = [];
    for (const v of f as unknown[]) {
      if (!isIndex(v, vertexCount)) {
        return `face ${i} in faces_vertices refers to a vertex that does not exist (this frame has ${vertexCount} vertices).`;
      }
      face.push(v);
    }
    out.push(face);
  }
  return out;
}

function readAssignments(value: unknown, edgeCount: number): Assignment[] | string {
  if (value === undefined) return Array.from({ length: edgeCount }, () => "U" as const);
  if (!Array.isArray(value) || value.length !== edgeCount) {
    return `edges_assignment must have one entry per edge (${edgeCount}).`;
  }
  const out: Assignment[] = [];
  for (let i = 0; i < value.length; i++) {
    const a: unknown = value[i];
    if (typeof a !== "string" || !(ASSIGNMENTS as readonly string[]).includes(a)) {
      return `edges_assignment[${i}] is not one of ${ASSIGNMENTS.join(", ")}.`;
    }
    out.push(a as Assignment);
  }
  return out;
}

function readNumberArray(value: unknown, length: number): number[] | undefined {
  if (!Array.isArray(value) || value.length !== length) return undefined;
  if (!value.every((n) => typeof n === "number" && Number.isFinite(n))) return undefined;
  return value as number[];
}

function isIndex(value: unknown, count: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < count;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
