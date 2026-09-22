/** FOLD edge assignment letters (FOLD spec 1.1). */
export type Assignment = "B" | "M" | "V" | "F" | "U" | "C" | "J";

export const ASSIGNMENTS: readonly Assignment[] = ["B", "M", "V", "F", "U", "C", "J"];

export const FOLD_ERROR_CODES = [
  "INVALID_JSON",
  "TOO_FEW_FRAMES",
  "MISSING_VERTICES_COORDS",
  "MISSING_EDGES_VERTICES",
  "MISSING_FACES_VERTICES",
  "VERTEX_COUNT_MISMATCH",
  "TOPOLOGY_MISMATCH",
  "BAD_FRAME_PARENT",
  "INHERIT_CYCLE",
  "BAD_COORDS",
  "BAD_EDGES",
  "BAD_FACES",
  "BAD_ASSIGNMENT",
  "FACE_EDGE_MISSING",
  "NON_MANIFOLD_EDGE",
  "TOO_MANY_FRAMES",
  "TOO_MANY_VERTICES",
  "TOO_MANY_FACES",
] as const;

export type FoldErrorCode = (typeof FOLD_ERROR_CODES)[number];

/** A user-facing validation error. `frameIndex` is set when the problem is in one frame. */
export interface FoldError {
  code: FoldErrorCode;
  message: string;
  frameIndex?: number;
}

/** The fields of one frame as written in the file (frame 0 is the top-level object). */
export type RawFrame = Record<string, unknown>;

/** A frame after inheritance: `fields` holds the merged geometry and this frame's own metadata. */
export interface ResolvedRawFrame {
  index: number;
  /** `frame_parent` when given, otherwise the previous frame; null for frame 0. */
  parentIndex: number | null;
  fields: RawFrame;
}

/** A frame whose arrays have been checked and typed. Coordinates are xyz-interleaved. */
export interface ValidatedFrame {
  index: number;
  parentIndex: number | null;
  title: string | undefined;
  description: string | undefined;
  coords: Float64Array;
  edgesVertices: [number, number][];
  facesVertices: number[][];
  assignments: Assignment[];
  /** `edges_foldAngle` from the file, if present and well-formed. Used only for warnings. */
  foldAngleHints: number[] | undefined;
}

/** Connectivity shared by every frame, derived from frame 0. Faces are counter-clockwise from +z. */
export interface Topology {
  vertexCount: number;
  edgesVertices: ReadonlyArray<readonly [number, number]>;
  facesVertices: ReadonlyArray<readonly number[]>;
  /** Faces adjacent to each edge: one for boundary edges, two for creases. */
  edgesFaces: ReadonlyArray<readonly number[]>;
  /** Edge ids around each face, aligned with `facesVertices` (edge i joins vertex i to i+1). */
  facesEdges: ReadonlyArray<readonly number[]>;
}

export interface ResolvedFrame {
  index: number;
  parentIndex: number | null;
  title: string | undefined;
  description: string | undefined;
  coords: Float64Array;
  assignments: Assignment[];
  /** Signed fold angle per edge in degrees (valley positive); NaN for boundary edges. */
  foldAngles: Float64Array;
  /** Sorted edge ids that are newly active in this frame (see `activity.ts`). */
  newlyActive: number[];
}

export interface ResolvedModel extends Topology {
  /** `file_title`, if present. */
  title: string | undefined;
  frames: ResolvedFrame[];
  /** Non-fatal observations, e.g. `edges_foldAngle` disagreeing with the geometry. */
  warnings: string[];
}

export interface LoadLimits {
  maxFrames?: number;
  maxVertices?: number;
  maxFaces?: number;
}

export interface LoadOptions {
  limits?: LoadLimits;
}

export type LoadResult = { ok: true; model: ResolvedModel } | { ok: false; errors: FoldError[] };
