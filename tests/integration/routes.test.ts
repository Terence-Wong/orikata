import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getModel } from "@/app/api/models/[slug]/route";
import { POST as createModelRoute } from "@/app/api/models/route";
import { POST as uploadToken } from "@/app/api/upload/route";
import { GLOBAL_LIMIT_PER_DAY, RATE_LIMIT_PER_HOUR } from "@/server/rateLimit";
import { MAX_FILE_BYTES } from "@/server/limits";
import { uploadAttempts } from "@/server/schema";
import { readFixture } from "../helpers/fixtures";
import { withTestDatabase } from "../helpers/database";
import type { Database } from "@/server/db";

const blobStore = vi.hoisted(() => ({
  files: new Map<string, { text: string; pathname: string }>(),
  deleted: [] as string[],
}));

vi.mock("@vercel/blob", () => ({
  head: async (url: string) => {
    const file = blobStore.files.get(url);
    if (!file) throw new Error("not found");
    return {
      url,
      pathname: file.pathname,
      size: Buffer.byteLength(file.text),
      uploadedAt: new Date(),
    };
  },
  del: async (url: string | string[]) => {
    for (const value of Array.isArray(url) ? url : [url]) {
      blobStore.deleted.push(value);
      blobStore.files.delete(value);
    }
  },
  list: async () => ({ blobs: [], hasMore: false, cursor: undefined }),
}));

let database: Database;
let close: () => Promise<void>;

const BLOB_HOST = "https://example.public.blob.vercel-storage.com";

function putBlob(name: string, text: string): string {
  const url = `${BLOB_HOST}/models/${name}`;
  blobStore.files.set(url, { text, pathname: `models/${name}` });
  return url;
}

function createRequest(body: unknown, address = "203.0.113.7"): Request {
  return new Request("https://orikata.test/api/models", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": address },
    body: JSON.stringify(body),
  });
}

function tokenRequest(pathname: string, payload: unknown, address = "203.0.113.7"): Request {
  return new Request("https://orikata.test/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": address },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: {
        pathname,
        callbackUrl: "https://orikata.test/api/upload",
        clientPayload: JSON.stringify(payload),
        multipart: false,
      },
    }),
  });
}

beforeEach(async () => {
  process.env.RATE_LIMIT_SALT = "test-salt";
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_testsecret";
  blobStore.files.clear();
  blobStore.deleted.length = 0;
  // The create route fetches the blob's contents over HTTP, so the fake store answers that too.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const file = blobStore.files.get(url);
    return file
      ? new Response(file.text, { status: 200 })
      : new Response("not found", { status: 404 });
  });
  ({ database, close } = await withTestDatabase());
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await close();
});

describe("POST /api/upload", () => {
  const payload = { size: 2048, frameCount: 2 };

  it("issues a token for a well-formed request", async () => {
    const response = await uploadToken(tokenRequest(`models/${crypto.randomUUID()}.fold`, payload));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { type?: string; clientToken?: string };
    expect(body.type).toBe("blob.generate-client-token");
    expect(body.clientToken).toBeTruthy();
  });

  it("records the attempt so it counts towards the rate limit", async () => {
    await uploadToken(tokenRequest(`models/${crypto.randomUUID()}.fold`, payload));
    const rows = await database.select().from(uploadAttempts);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("token");
  });

  it.each([
    ["a file over the size cap", { size: MAX_FILE_BYTES + 1, frameCount: 2 }],
    ["a single-frame file", { size: 2048, frameCount: 1 }],
    ["a file with too many frames", { size: 2048, frameCount: 5000 }],
    ["a missing size", { frameCount: 2 }],
  ])("refuses %s", async (_label, badPayload) => {
    const response = await uploadToken(
      tokenRequest(`models/${crypto.randomUUID()}.fold`, badPayload),
    );
    expect(response.status).toBe(400);
  });

  it.each([
    ["another folder", "uploads/abcdefghijklmnopqrst.fold"],
    ["a traversal attempt", "models/../secrets.fold"],
    ["another extension", "models/abcdefghijklmnopqrst.js"],
  ])("refuses a pathname in %s", async (_label, pathname) => {
    const response = await uploadToken(tokenRequest(pathname, payload));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("not allowed") });
  });

  it("refuses once an address is over its hourly limit", async () => {
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) {
      await uploadToken(tokenRequest(`models/${crypto.randomUUID()}.fold`, payload));
    }
    const response = await uploadToken(tokenRequest(`models/${crypto.randomUUID()}.fold`, payload));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Too many") });
  });
});

describe("POST /api/models", () => {
  it("creates a slug for a valid file and stores its metadata", async () => {
    const text = readFixture("valid", "preliminary-base");
    const blobUrl = putBlob("abcdef01-2345-6789-abcd-ef0123456789.fold", text);

    const response = await createModelRoute(createRequest({ blobUrl }));
    expect(response.status).toBe(201);
    const { slug } = (await response.json()) as { slug: string };
    expect(slug).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{11}$/);

    const view = await getModel(new Request("https://orikata.test"), {
      params: Promise.resolve({ slug }),
    });
    expect(view.status).toBe(200);
    expect(await view.json()).toMatchObject({
      slug,
      blobUrl,
      title: "Preliminary base",
      frameCount: 4,
      sizeBytes: Buffer.byteLength(text),
    });
  });

  it("falls back to the filename when the file has no title", async () => {
    const text = readFixture("valid", "preliminary-base").replace(
      '"file_title": "Preliminary base",',
      "",
    );
    const blobUrl = putBlob("abcdef01-2345-6789-abcd-ef0123456789.fold", text);
    const response = await createModelRoute(createRequest({ blobUrl, filename: "my crane.fold" }));
    expect(response.status).toBe(201);
    const { slug } = (await response.json()) as { slug: string };
    const view = await getModel(new Request("https://orikata.test"), {
      params: Promise.resolve({ slug }),
    });
    expect(await view.json()).toMatchObject({ title: "my crane" });
  });

  it.each([
    ["invalid-json", "INVALID_JSON"],
    ["one-frame", "TOO_FEW_FRAMES"],
    ["vertex-count-changes", "VERTEX_COUNT_MISMATCH"],
    ["topology-changes", "TOPOLOGY_MISMATCH"],
    ["inherit-cycle", "INHERIT_CYCLE"],
    ["bad-frame-parent", "BAD_FRAME_PARENT"],
    ["missing-vertices-coords", "MISSING_VERTICES_COORDS"],
    ["missing-edges-vertices", "MISSING_EDGES_VERTICES"],
    ["missing-faces-vertices", "MISSING_FACES_VERTICES"],
  ])("refuses %s and deletes the blob", async (fixture, code) => {
    const blobUrl = putBlob(
      "abcdef01-2345-6789-abcd-ef0123456789.fold",
      readFixture("invalid", fixture),
    );
    const response = await createModelRoute(createRequest({ blobUrl }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string; errors: { code: string }[] };
    expect(body.errors[0]!.code).toBe(code);
    expect(body.error.length).toBeGreaterThan(10);
    expect(blobStore.deleted).toContain(blobUrl);
  });

  it("refuses a blob that is not in our store, so it cannot be used to fetch other URLs", async () => {
    const response = await createModelRoute(
      createRequest({ blobUrl: "https://example.com/secrets.json" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("could not be found"),
    });
  });

  it.each([
    ["a missing body", {}],
    ["a blobUrl that is not a URL", { blobUrl: "not a url" }],
  ])("refuses %s", async (_label, body) => {
    expect((await createModelRoute(createRequest(body))).status).toBe(400);
  });

  it("refuses a file over the size cap without reading it", async () => {
    const blobUrl = putBlob(
      "abcdef01-2345-6789-abcd-ef0123456789.fold",
      "x".repeat(MAX_FILE_BYTES + 1),
    );
    const response = await createModelRoute(createRequest({ blobUrl }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("larger than") });
    expect(blobStore.deleted).toContain(blobUrl);
  });

  it("refuses a model over the vertex cap", async () => {
    const vertices = Array.from({ length: 10_001 }, (_, i) => [i, 0]);
    const blobUrl = putBlob(
      "abcdef01-2345-6789-abcd-ef0123456789.fold",
      JSON.stringify({
        vertices_coords: vertices,
        edges_vertices: [[0, 1]],
        faces_vertices: [[0, 1, 2]],
        file_frames: [{ frame_parent: 0, frame_inherit: true, vertices_coords: vertices }],
      }),
    );
    const response = await createModelRoute(createRequest({ blobUrl }));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { errors: { code: string }[] };
    expect(body.errors[0]!.code).toBe("TOO_MANY_VERTICES");
  });

  it("returns 429 once an address is over its hourly limit", async () => {
    const text = readFixture("valid", "book-fold");
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) {
      await createModelRoute(
        createRequest({ blobUrl: putBlob(`${i}-aaaaaaaaaaaaaaaaaaaa.fold`, text) }),
      );
    }
    const response = await createModelRoute(
      createRequest({ blobUrl: putBlob("last-aaaaaaaaaaaaaaaaaaaa.fold", text) }),
    );
    expect(response.status).toBe(429);
  });

  it("returns 429 for everyone once the day's ceiling is reached", async () => {
    await database.insert(uploadAttempts).values(
      Array.from({ length: GLOBAL_LIMIT_PER_DAY }, (_, i) => ({
        ipHash: `hash-${i}`,
        kind: "create",
      })),
    );
    const blobUrl = putBlob(
      "abcdef01-2345-6789-abcd-ef0123456789.fold",
      readFixture("valid", "book-fold"),
    );
    const response = await createModelRoute(createRequest({ blobUrl }, "198.51.100.4"));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("paused") });
  });
});

describe("GET /api/models/[slug]", () => {
  it("returns 404 for a slug that does not exist", async () => {
    const response = await getModel(new Request("https://orikata.test"), {
      params: Promise.resolve({ slug: "zzzzzzzzzzz" }),
    });
    expect(response.status).toBe(404);
  });

  it.each([
    ["a malformed slug", "nope"],
    ["a traversal attempt", "../../etc/passwd"],
  ])("returns 404 for %s", async (_label, slug) => {
    const response = await getModel(new Request("https://orikata.test"), {
      params: Promise.resolve({ slug }),
    });
    expect(response.status).toBe(404);
  });
});
