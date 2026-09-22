import "server-only";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { del, head, list } from "@vercel/blob";
import { blobToken } from "./env";
import { LOCAL_BACKEND_DIR, localBlobName, usingLocalBackend } from "./localBackend";

export interface StoredBlob {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
}

const localDir = () => join(process.cwd(), LOCAL_BACKEND_DIR, "blobs");

/**
 * Details of an uploaded file. Asking the store rather than trusting the client is what proves the
 * URL belongs to us, so this route cannot be used to fetch arbitrary addresses.
 */
export async function headBlob(url: string): Promise<StoredBlob> {
  if (usingLocalBackend()) {
    const name = localBlobName(url);
    if (!name) throw new Error("not a local blob");
    const path = join(localDir(), name);
    const info = await stat(path);
    return { url, pathname: `models/${name}`, size: info.size, uploadedAt: info.mtime };
  }
  const blob = await head(url, { token: blobToken() });
  return {
    url: blob.url,
    pathname: blob.pathname,
    size: blob.size,
    uploadedAt: new Date(blob.uploadedAt),
  };
}

export async function readBlobText(url: string): Promise<string> {
  if (usingLocalBackend()) {
    const name = localBlobName(url);
    if (!name) throw new Error("not a local blob");
    return readFile(join(localDir(), name), "utf8");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`blob fetch failed: ${response.status}`);
  return response.text();
}

export async function deleteBlob(url: string | string[]): Promise<void> {
  const urls = Array.isArray(url) ? url : [url];
  if (usingLocalBackend()) {
    for (const value of urls) {
      const name = localBlobName(value);
      if (name) await unlink(join(localDir(), name)).catch(() => undefined);
    }
    return;
  }
  await del(urls, { token: blobToken() });
}

/** Every stored file, for the cleanup cron. */
export async function listBlobs(origin: string): Promise<StoredBlob[]> {
  if (usingLocalBackend()) {
    const dir = localDir();
    const names = await readdir(dir).catch(() => []);
    return Promise.all(
      names.map(async (name) => {
        const info = await stat(join(dir, name));
        return {
          url: `${origin}/api/local-blob/${name}`,
          pathname: `models/${name}`,
          size: info.size,
          uploadedAt: info.mtime,
        };
      }),
    );
  }

  const token = blobToken();
  const blobs: StoredBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ token, prefix: "models/", cursor, limit: 500 });
    for (const blob of page.blobs) {
      blobs.push({
        url: blob.url,
        pathname: blob.pathname,
        size: blob.size,
        uploadedAt: new Date(blob.uploadedAt),
      });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

/** Writes a file to the local store. Only reachable while the local backend is on. */
export async function writeLocalBlob(name: string, contents: string): Promise<void> {
  const dir = localDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), contents, "utf8");
}
