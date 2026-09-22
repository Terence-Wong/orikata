import { isPlainObject } from "./parse";
import type { FoldError, RawFrame, ResolvedRawFrame } from "./types";

/** Per-frame metadata that describes the step itself and therefore is never inherited. */
const NON_INHERITED_KEYS = new Set([
  "frame_title",
  "frame_description",
  "frame_author",
  "frame_classes",
  "frame_attributes",
]);

/** Control keys consumed by resolution and not exposed on resolved frames. */
const CONTROL_KEYS = new Set(["frame_parent", "frame_inherit"]);

/**
 * Splits a FOLD object into frames. Frame 0 is the top-level object minus `file_*` keys and
 * `file_frames`; `file_frames[i]` is frame i+1. Non-object entries in `file_frames` become empty
 * frames here and surface as frames without coordinates during validation.
 */
export function splitFrames(root: RawFrame): RawFrame[] {
  const frame0: RawFrame = {};
  for (const [key, value] of Object.entries(root)) {
    if (!key.startsWith("file_")) frame0[key] = value;
  }
  const rest = Array.isArray(root.file_frames) ? root.file_frames : [];
  return [frame0, ...rest.map((entry) => (isPlainObject(entry) ? entry : {}))];
}

export type ResolveResult =
  { ok: true; frames: ResolvedRawFrame[] } | { ok: false; error: FoldError };

type FieldsOrError = { ok: true; fields: RawFrame } | { ok: false; error: FoldError };

/**
 * Applies `frame_inherit` / `frame_parent`: an inheriting frame takes its parent's resolved fields
 * (recursively) and overlays its own. Metadata keys are never inherited. Cycles and bad parent
 * references are rejected; resolution stops at the first problem.
 */
export function resolveFrames(frames: RawFrame[]): ResolveResult {
  const resolved = new Map<number, RawFrame>();
  const visiting: number[] = [];

  const resolve = (index: number): FieldsOrError => {
    const done = resolved.get(index);
    if (done) return { ok: true, fields: done };
    if (visiting.includes(index)) {
      const cycle = [...visiting.slice(visiting.indexOf(index)), index].join(" → ");
      return {
        ok: false,
        error: {
          code: "INHERIT_CYCLE",
          frameIndex: index,
          message: `Frame ${index} inherits from itself through the chain ${cycle}.`,
        },
      };
    }
    const frame = frames[index]!;
    const own = ownFields(frame);
    if (frame.frame_inherit !== true) {
      resolved.set(index, own);
      return { ok: true, fields: own };
    }
    const parent = parentIndexOf(frame, frames.length);
    if (parent === null) {
      return {
        ok: false,
        error: {
          code: "BAD_FRAME_PARENT",
          frameIndex: index,
          message: `Frame ${index} inherits from a frame_parent that does not exist (${describeParent(frame.frame_parent)}; this file has ${frames.length} frames).`,
        },
      };
    }
    visiting.push(index);
    const parentResult = resolve(parent);
    visiting.pop();
    if (!parentResult.ok) return parentResult;
    const merged: RawFrame = {};
    for (const [key, value] of Object.entries(parentResult.fields)) {
      if (!NON_INHERITED_KEYS.has(key)) merged[key] = value;
    }
    Object.assign(merged, own);
    resolved.set(index, merged);
    return { ok: true, fields: merged };
  };

  const out: ResolvedRawFrame[] = [];
  for (let index = 0; index < frames.length; index++) {
    const result = resolve(index);
    if (!result.ok) return result;
    const frame = frames[index]!;
    const explicitParent =
      frame.frame_parent === undefined ? null : parentIndexOf(frame, frames.length);
    const parentIndex = index === 0 ? null : (explicitParent ?? index - 1);
    out.push({ index, parentIndex, fields: result.fields });
  }
  return { ok: true, frames: out };
}

function ownFields(frame: RawFrame): RawFrame {
  const own: RawFrame = {};
  for (const [key, value] of Object.entries(frame)) {
    if (!CONTROL_KEYS.has(key)) own[key] = value;
  }
  return own;
}

/** Returns a valid parent index, or null when `frame_parent` is missing or malformed. */
function parentIndexOf(frame: RawFrame, frameCount: number): number | null {
  const parent = frame.frame_parent;
  if (typeof parent !== "number" || !Number.isInteger(parent)) return null;
  if (parent < 0 || parent >= frameCount) return null;
  return parent;
}

function describeParent(value: unknown): string {
  return value === undefined ? "no frame_parent given" : `frame_parent = ${JSON.stringify(value)}`;
}
