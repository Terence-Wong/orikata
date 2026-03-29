/** Edge assignment types in the FOLD format */
export type EdgeAssignment = "M" | "V" | "B" | "F" | "U";

/** A single FOLD frame (either top-level or from file_frames) */
export interface FoldFrame {
  frame_title?: string;
  frame_description?: string;
  frame_class?: "creasePattern" | "foldedForm" | "graph" | "linkage";
  frame_parent?: number;
  frame_inherit?: boolean;

  vertices_coords?: number[][];
  edges_vertices?: [number, number][];
  edges_assignment?: EdgeAssignment[];
  edges_foldAngle?: number[];
  faces_vertices?: number[][];
}

/** Top-level FOLD file structure */
export interface FoldFile extends FoldFrame {
  file_spec?: number;
  file_creator?: string;
  file_title?: string;
  file_classes?: string[];
  file_frames?: FoldFrame[];
}

/** A fully resolved frame with all inherited properties materialized */
export interface ResolvedFrame {
  index: number;
  title: string;
  description?: string;
  frameClass: "creasePattern" | "foldedForm" | "graph" | "linkage";
  vertices_coords: number[][];
  edges_vertices: [number, number][];
  edges_assignment: EdgeAssignment[];
  edges_foldAngle: number[];
  faces_vertices: number[][];
}

/** Diff between two consecutive frames for crease pattern highlighting */
export interface FrameDiff {
  /** Edge indices that became M or V in the current frame but were not in the previous */
  newlyActiveEdges: number[];
  /** Edge indices that changed assignment type between frames */
  changedEdges: number[];
}
