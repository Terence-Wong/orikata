import type { FoldFile } from "./types";

const REQUIRED_PROPERTIES = [
  "vertices_coords",
  "edges_vertices",
  "edges_assignment",
  "faces_vertices",
] as const;

export class FoldParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoldParseError";
  }
}

/**
 * Parse and validate a FOLD JSON string.
 * Throws FoldParseError if the data is invalid.
 */
export function parseFoldFile(json: string): FoldFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new FoldParseError("Invalid JSON");
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new FoldParseError("FOLD file must be a JSON object");
  }

  const fold = data as Record<string, unknown>;

  // Validate required properties exist on the top-level frame
  for (const prop of REQUIRED_PROPERTIES) {
    if (!Array.isArray(fold[prop])) {
      throw new FoldParseError(`Missing or invalid required property: ${prop}`);
    }
  }

  // Handle legacy field name
  if (fold.edges_foldAngle === undefined && fold.edges_foldAngles !== undefined) {
    fold.edges_foldAngle = fold.edges_foldAngles;
  }

  return fold as unknown as FoldFile;
}

/** Validate file size in bytes. Returns true if within limit. */
export function validateFileSize(bytes: number, maxBytes: number = 5 * 1024 * 1024): boolean {
  return bytes <= maxBytes;
}
