import { newlyActiveEdges } from "./activity";
import { resolveFrames, splitFrames } from "./frames";
import { computeFoldAngles } from "./geometry";
import { parseFoldText } from "./parse";
import { buildTopology } from "./topology";
import type { FoldError, LoadOptions, LoadResult, ResolvedFrame, ValidatedFrame } from "./types";
import { validateFrames, validateRawFrames } from "./validate";

export type * from "./types";
export { ACTIVE_ANGLE_THRESHOLD_DEG } from "./activity";

/** `edges_foldAngle` values further than this from the computed angle produce a warning. */
const FOLD_ANGLE_HINT_TOLERANCE_DEG = 1;

/**
 * Parses, resolves, validates and measures a FOLD file. The result contains fully resolved frames
 * (coordinates, assignments, fold angles, newly-active edges) and the shared topology, or a list
 * of user-facing errors.
 */
export function loadFold(text: string, options: LoadOptions = {}): LoadResult {
  const limits = options.limits ?? {};

  const parsed = parseFoldText(text);
  if (!parsed.ok) return { ok: false, errors: [parsed.error] };

  const raw = splitFrames(parsed.value);
  const rawErrors = validateRawFrames(raw);
  if (rawErrors.length > 0) return { ok: false, errors: rawErrors };
  if (limits.maxFrames !== undefined && raw.length > limits.maxFrames) {
    return fail(
      "TOO_MANY_FRAMES",
      `This file has ${raw.length} frames; the limit is ${limits.maxFrames}.`,
    );
  }

  const resolved = resolveFrames(raw);
  if (!resolved.ok) return { ok: false, errors: [resolved.error] };

  const validated = validateFrames(resolved.frames);
  if (!validated.ok) return validated;
  const frame0 = validated.frames[0]!;
  const vertexCount = frame0.coords.length / 3;
  if (limits.maxVertices !== undefined && vertexCount > limits.maxVertices) {
    return fail(
      "TOO_MANY_VERTICES",
      `This model has ${vertexCount} vertices; the limit is ${limits.maxVertices}.`,
    );
  }
  if (limits.maxFaces !== undefined && frame0.facesVertices.length > limits.maxFaces) {
    return fail(
      "TOO_MANY_FACES",
      `This model has ${frame0.facesVertices.length} faces; the limit is ${limits.maxFaces}.`,
    );
  }

  const topology = buildTopology(frame0);
  if (!topology.ok) return topology;

  const warnings: string[] = [];
  const frames: ResolvedFrame[] = [];
  for (const frame of validated.frames) {
    const foldAngles = computeFoldAngles(frame.coords, topology.topology, frame.assignments);
    warnings.push(...foldAngleHintWarnings(frame, foldAngles));
    frames.push({
      index: frame.index,
      parentIndex: frame.parentIndex,
      title: frame.title,
      description: frame.description,
      coords: frame.coords,
      assignments: frame.assignments,
      foldAngles,
      newlyActive: [],
    });
  }
  for (const frame of frames) {
    const parent = frame.parentIndex === null ? null : frames[frame.parentIndex]!;
    const previous = frame.index === 0 ? null : frames[frame.index - 1]!;
    frame.newlyActive = newlyActiveEdges(frame, parent, previous);
  }

  const title = parsed.value.file_title;
  return {
    ok: true,
    model: {
      ...topology.topology,
      title: typeof title === "string" ? title : undefined,
      frames,
      warnings,
    },
  };
}

function foldAngleHintWarnings(frame: ValidatedFrame, computed: Float64Array): string[] {
  const hints = frame.foldAngleHints;
  if (!hints) return [];
  const warnings: string[] = [];
  hints.forEach((hint, e) => {
    const actual = computed[e]!;
    if (Number.isNaN(actual)) return;
    if (Math.abs(hint - actual) > FOLD_ANGLE_HINT_TOLERANCE_DEG) {
      warnings.push(
        `edges_foldAngle in frame ${frame.index} for edge ${e} is ${hint}° but the geometry gives ${actual.toFixed(2)}°.`,
      );
    }
  });
  return warnings;
}

function fail(code: FoldError["code"], message: string): LoadResult {
  return { ok: false, errors: [{ code, message }] };
}
