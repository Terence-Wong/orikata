import { readBlobText } from "@/server/blob";
import { localBlobName, usingLocalBackend } from "@/server/localBackend";

export const runtime = "nodejs";

/** Serves a file from the local store, standing in for Vercel Blob's public URLs. */
export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> },
): Promise<Response> {
  if (!usingLocalBackend()) return new Response("Not found", { status: 404 });
  const { name } = await context.params;
  const url = new URL(`/api/local-blob/${name}`, request.url).toString();
  if (!localBlobName(url)) return new Response("Not found", { status: 404 });
  try {
    return new Response(await readBlobText(url), {
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
