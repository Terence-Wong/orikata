import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { blobToken } from "@/server/env";
import {
  BLOB_PATHNAME_PATTERN,
  FOLD_CONTENT_TYPE,
  MAX_FILE_BYTES,
  MAX_FRAMES,
} from "@/server/limits";
import { checkRateLimit } from "@/server/rateLimit";

/**
 * Hands the browser a token so it can upload straight to Vercel Blob. Nothing about the file
 * passes through this function, so the 4.5 MB serverless body limit does not apply; the size and
 * type caps below are enforced by Vercel's upload endpoint, not just by us.
 */
export const runtime = "nodejs";

const clientPayload = z.object({
  size: z.number().int().positive().max(MAX_FILE_BYTES),
  frameCount: z.number().int().min(2).max(MAX_FRAMES),
});

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      token: blobToken(),
      onBeforeGenerateToken: async (pathname, payload) => {
        if (!BLOB_PATHNAME_PATTERN.test(pathname)) {
          throw new Error("That upload path is not allowed.");
        }
        // The payload is the client's claim about the file; the real checks happen in
        // /api/models once the blob exists. This one just avoids issuing pointless tokens.
        const parsed = clientPayload.safeParse(JSON.parse(payload ?? "{}"));
        if (!parsed.success) throw new Error("That file cannot be uploaded.");

        const limit = await checkRateLimit(request, "token");
        if (!limit.allowed) {
          throw new Error(
            limit.reason === "global"
              ? "Uploads are paused for now. Please try again later."
              : "Too many uploads from this connection. Please try again later.",
          );
        }

        return {
          allowedContentTypes: [FOLD_CONTENT_TYPE],
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // Nothing to do: the slug is created by POST /api/models, which is synchronous and
        // testable, and this callback never fires against localhost.
      },
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload could not be started.";
    return Response.json({ error: message }, { status: 400 });
  }
}
