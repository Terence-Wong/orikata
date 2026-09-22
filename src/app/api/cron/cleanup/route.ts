import { del, list } from "@vercel/blob";
import { inArray, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { blobToken, cronSecret } from "@/server/env";
import { models, uploadAttempts } from "@/server/schema";
import { ATTEMPT_RETENTION_MS } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A blob younger than this may simply be mid-upload, so it is left alone. */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Daily housekeeping: drop rate-limit rows once they are outside every window, and delete blobs
 * that were uploaded but never turned into a model, which happens when a client abandons the flow
 * between the upload and the slug.
 */
export async function GET(request: Request): Promise<Response> {
  if (request.headers.get("authorization") !== `Bearer ${cronSecret()}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const database = db();
  const now = Date.now();

  await database
    .delete(uploadAttempts)
    .where(lt(uploadAttempts.createdAt, new Date(now - ATTEMPT_RETENTION_MS)));

  const token = blobToken();
  let cursor: string | undefined;
  let orphans = 0;
  do {
    const page = await list({ token, prefix: "models/", cursor, limit: 500 });
    const candidates = page.blobs.filter(
      (blob) => now - new Date(blob.uploadedAt).getTime() > ORPHAN_GRACE_MS,
    );
    if (candidates.length > 0) {
      const known = await database
        .select({ url: models.blobUrl })
        .from(models)
        .where(
          inArray(
            models.blobUrl,
            candidates.map((blob) => blob.url),
          ),
        );
      const keep = new Set(known.map((row) => row.url));
      const unused = candidates.filter((blob) => !keep.has(blob.url));
      if (unused.length > 0) {
        await del(
          unused.map((blob) => blob.url),
          { token },
        );
        orphans += unused.length;
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return Response.json({ orphansDeleted: orphans });
}
