import { createHash } from "node:crypto";
import { del, head } from "@vercel/blob";
import { z } from "zod";
import { loadFold } from "@/fold";
import { blobToken } from "@/server/env";
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

  const token = blobToken();
  const { blobUrl } = parsed.data;

  let blob;
  try {
    blob = await head(blobUrl, { token });
  } catch {
    return error("That upload could not be found. Please try again.", 400);
  }
  if (blob.size > MAX_FILE_BYTES) {
    await discard(blobUrl, token);
    return error(`That file is larger than the ${MAX_FILE_BYTES / (1024 * 1024)} MB limit.`, 400);
  }

  const response = await fetch(blobUrl);
  if (!response.ok) return error("That upload could not be read. Please try again.", 400);
  const text = await response.text();

  const loaded = loadFold(text, { limits: LOAD_LIMITS });
  if (!loaded.ok) {
    await discard(blobUrl, token);
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
async function discard(url: string, token: string): Promise<void> {
  await del(url, { token }).catch(() => undefined);
}

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
