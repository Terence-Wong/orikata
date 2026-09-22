import { randomBytes } from "node:crypto";
import { writeLocalBlob } from "@/server/blob";
import { MAX_FILE_BYTES } from "@/server/limits";
import { usingLocalBackend } from "@/server/localBackend";
import { checkRateLimit } from "@/server/rateLimit";

export const runtime = "nodejs";

/**
 * Takes an upload straight into the local store. Stands in for the browser's direct upload to
 * Vercel Blob, so the size cap is enforced here instead of in the upload token.
 */
export async function POST(request: Request): Promise<Response> {
  if (!usingLocalBackend()) return new Response("Not found", { status: 404 });

  const limit = await checkRateLimit(request, "token");
  if (!limit.allowed) {
    return Response.json({ error: "Too many uploads. Please try again later." }, { status: 429 });
  }

  const contents = await request.text();
  if (Buffer.byteLength(contents) > MAX_FILE_BYTES) {
    return Response.json({ error: "That file is too large." }, { status: 413 });
  }

  const name = `${randomBytes(16).toString("hex")}.fold`;
  await writeLocalBlob(name, contents);
  return Response.json({ url: new URL(`/api/local-blob/${name}`, request.url).toString() });
}
