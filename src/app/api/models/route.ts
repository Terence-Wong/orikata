import { createHash } from "node:crypto";
import { z } from "zod";
import { loadFold } from "@/fold";
import { deleteBlob, headBlob, readBlobText } from "@/server/blob";
import { LOAD_LIMITS, MAX_FILE_BYTES } from "@/server/limits";
import { createModel } from "@/server/models";
import { checkRateLimit } from "@/server/rateLimit";

export const runtime = "nodejs";

const body = z.object({
  blobUrl: z.string().url(),
  /** The file's name, used as a title when the FOLD file has none. */
  filename: z.string().max(200).optional(),
});

/**
 * Turns an uploaded blob into a shareable slug. The file is fetched and validated here, whatever
 * the client claimed: `head` proves the blob is in our own store, which also stops this route from
 * being used to fetch arbitrary URLs. A file that fails validation is deleted again.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("That request was not understood.", 400);

  const limit = await checkRateLimit(request, "create");
  if (!limit.allowed) {
    return error(
      limit.reason === "global"
        ? "Uploads are paused for now. Please try again later."
        : "Too many uploads from this connection. Please try again later.",
      429,
    );
  }

  const { blobUrl } = parsed.data;

  let blob;
  try {
    blob = await headBlob(blobUrl);
  } catch {
    return error("That upload could not be found. Please try again.", 400);
  }
  if (blob.size > MAX_FILE_BYTES) {
    await discard(blobUrl);
    return error(`That file is larger than the ${MAX_FILE_BYTES / (1024 * 1024)} MB limit.`, 400);
  }

  let text: string;
  try {
    text = await readBlobText(blobUrl);
  } catch {
    return error("That upload could not be read. Please try again.", 400);
  }

  const loaded = loadFold(text, { limits: LOAD_LIMITS });
  if (!loaded.ok) {
    await discard(blobUrl);
    return Response.json(
      { error: loaded.errors[0]!.message, errors: loaded.errors },
      { status: 422 },
    );
  }

  const model = await createModel({
    blobUrl: blob.url,
    blobPathname: blob.pathname,
    title: loaded.model.title ?? titleFromFilename(parsed.data.filename) ?? null,
    frameCount: loaded.model.frames.length,
    sizeBytes: blob.size,
    sha256: createHash("sha256").update(text).digest("hex"),
  });

  return Response.json({ slug: model.slug }, { status: 201 });
}

function titleFromFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const withoutExtension = base.replace(/\.fold$/i, "").trim();
  return withoutExtension.length > 0 ? withoutExtension : undefined;
}

/** Orphaned blobs are also swept by the cleanup cron; this keeps the common case tidy. */
async function discard(url: string): Promise<void> {
  await deleteBlob(url).catch(() => undefined);
}

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
