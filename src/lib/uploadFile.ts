import { upload } from "@vercel/blob/client";
import { BLOB_PREFIX, FOLD_CONTENT_TYPE } from "@/server/limits";
import { LOCAL_BLOB_ROUTE } from "@/server/localBackend";

export interface UploadPayload {
  size: number;
  frameCount: number;
}

/**
 * Puts the file in the store and returns its URL. In a deployment the browser uploads straight to
 * Vercel Blob, so the file never passes through a serverless function and the 4.5 MB body limit
 * does not apply. The local backend posts to our own route instead.
 */
export type UploadMode = "blob" | "local";

export async function uploadFoldFile(
  file: File,
  payload: UploadPayload,
  mode: UploadMode,
): Promise<{ url: string }> {
  if (mode === "local") {
    const response = await fetch(LOCAL_BLOB_ROUTE, {
      method: "POST",
      headers: { "content-type": FOLD_CONTENT_TYPE },
      body: await file.text(),
    });
    const body = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !body.url) throw new Error(body.error ?? "The upload failed.");
    return { url: body.url };
  }

  const blob = await upload(`${BLOB_PREFIX}${crypto.randomUUID()}.fold`, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    contentType: FOLD_CONTENT_TYPE,
    clientPayload: JSON.stringify(payload),
  });
  return { url: blob.url };
}
