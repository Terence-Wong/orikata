import type { FoldError, RawFrame } from "./types";

export type ParseResult = { ok: true; value: RawFrame } | { ok: false; error: FoldError };

/** Parses FOLD text. A FOLD file must be a JSON object; anything else is rejected. */
export function parseFoldText(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      error: { code: "INVALID_JSON", message: `This file is not valid JSON (${detail}).` },
    };
  }
  if (!isPlainObject(value)) {
    return {
      ok: false,
      error: {
        code: "INVALID_JSON",
        message: "This file is not valid JSON for FOLD: the top level must be an object.",
      },
    };
  }
  return { ok: true, value };
}

export function isPlainObject(value: unknown): value is RawFrame {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
