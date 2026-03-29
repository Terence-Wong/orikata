import type {
  FoldFile,
  FoldFrame,
  ResolvedFrame,
  FrameDiff,
  EdgeAssignment,
} from "./types";
import { FoldParseError } from "./parser";

/** Properties that can be inherited between frames */
const INHERITABLE_KEYS = [
  "vertices_coords",
  "edges_vertices",
  "edges_assignment",
  "edges_foldAngle",
  "faces_vertices",
] as const;

/**
 * Get the raw frame object by index.
 * Frame 0 = top-level properties, Frame N (N>0) = file_frames[N-1].
 */
function getRawFrame(file: FoldFile, index: number): FoldFrame {
  if (index === 0) return file;
  const frames = file.file_frames;
  if (!frames || index - 1 >= frames.length) {
    throw new FoldParseError(`Frame ${index} does not exist`);
  }
  return frames[index - 1];
}

/**
 * Resolve a single frame by walking up the frame_parent chain
 * and merging inherited properties.
 */
export function resolveFrame(file: FoldFile, frameIndex: number): ResolvedFrame {
  const visited = new Set<number>();
  const chain: FoldFrame[] = [];

  // Walk up parent chain
  let current = frameIndex;
  while (true) {
    if (visited.has(current)) {
      throw new FoldParseError(`Circular frame_parent reference at frame ${current}`);
    }
    visited.add(current);
    const frame = getRawFrame(file, current);
    chain.push(frame);

    if (frame.frame_inherit && frame.frame_parent !== undefined) {
      current = frame.frame_parent;
    } else {
      break;
    }
  }

  // Merge properties: first frame in chain (the requested one) has highest priority
  const merged: Record<string, unknown> = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    const frame = chain[i];
    for (const key of INHERITABLE_KEYS) {
      if (frame[key] !== undefined) {
        merged[key] = frame[key];
      }
    }
  }

  // The title/description/class come from the requested frame itself
  const requestedFrame = chain[0];

  const vertices_coords = merged.vertices_coords as number[][] | undefined;
  const edges_vertices = merged.edges_vertices as [number, number][] | undefined;
  const edges_assignment = merged.edges_assignment as EdgeAssignment[] | undefined;
  const faces_vertices = merged.faces_vertices as number[][] | undefined;

  if (!vertices_coords || !edges_vertices || !edges_assignment || !faces_vertices) {
    throw new FoldParseError(
      `Frame ${frameIndex} is missing required geometry after inheritance resolution`
    );
  }

  // Default fold angles to 0 if not provided
  const edges_foldAngle = (merged.edges_foldAngle as number[] | undefined) ??
    new Array(edges_vertices.length).fill(0);

  return {
    index: frameIndex,
    title: requestedFrame.frame_title ?? `Step ${frameIndex}`,
    description: requestedFrame.frame_description,
    frameClass: requestedFrame.frame_class ?? (frameIndex === 0 ? "creasePattern" : "foldedForm"),
    vertices_coords,
    edges_vertices,
    edges_assignment,
    edges_foldAngle,
    faces_vertices,
  };
}

/** Resolve all frames in a FOLD file. */
export function resolveAllFrames(file: FoldFile): ResolvedFrame[] {
  const count = 1 + (file.file_frames?.length ?? 0);
  const frames: ResolvedFrame[] = [];
  for (let i = 0; i < count; i++) {
    frames.push(resolveFrame(file, i));
  }
  return frames;
}

/** Compute diff between two consecutive frames for crease pattern highlighting. */
export function diffFrames(prev: ResolvedFrame, next: ResolvedFrame): FrameDiff {
  const newlyActiveEdges: number[] = [];
  const changedEdges: number[] = [];

  const len = Math.min(prev.edges_assignment.length, next.edges_assignment.length);
  const activeFoldTypes = new Set<EdgeAssignment>(["M", "V"]);

  for (let i = 0; i < len; i++) {
    const prevA = prev.edges_assignment[i];
    const nextA = next.edges_assignment[i];

    if (prevA !== nextA) {
      changedEdges.push(i);
      if (activeFoldTypes.has(nextA) && !activeFoldTypes.has(prevA)) {
        newlyActiveEdges.push(i);
      }
    }
  }

  // Edges that exist only in next frame
  for (let i = len; i < next.edges_assignment.length; i++) {
    if (activeFoldTypes.has(next.edges_assignment[i])) {
      newlyActiveEdges.push(i);
    }
    changedEdges.push(i);
  }

  return { newlyActiveEdges, changedEdges };
}
