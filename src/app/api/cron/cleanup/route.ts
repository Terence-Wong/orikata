import { inArray, lt } from "drizzle-orm";
import { deleteBlob, listBlobs } from "@/server/blob";
import { db } from "@/server/db";
import { cronSecret } from "@/server/env";
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

  const origin = new URL(request.url).origin;
  const candidates = (await listBlobs(origin)).filter(
    (blob) => now - blob.uploadedAt.getTime() > ORPHAN_GRACE_MS,
  );

  let orphans = 0;
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
      await deleteBlob(unused.map((blob) => blob.url));
      orphans = unused.length;
    }
  }

  return Response.json({ orphansDeleted: orphans });
}
