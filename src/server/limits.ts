/** Caps enforced on every upload, on the client for fast feedback and again on the server. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FRAMES = 100;
export const MAX_VERTICES = 10_000;
export const MAX_FACES = 20_000;

export const LOAD_LIMITS = {
  maxFrames: MAX_FRAMES,
  maxVertices: MAX_VERTICES,
  maxFaces: MAX_FACES,
} as const;

/** Where uploads live in the blob store, and what a valid pathname looks like. */
export const BLOB_PREFIX = "models/";
export const BLOB_PATHNAME_PATTERN = /^models\/[0-9a-f-]{20,64}\.fold$/;

/** Browsers give `.fold` files an empty type, so the client sends this explicitly. */
export const FOLD_CONTENT_TYPE = "application/json";
