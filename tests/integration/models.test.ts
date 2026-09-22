import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Slug generation is random by design, so the collision path needs a way to force one.
const queued = vi.hoisted(() => ({ slugs: [] as string[] }));
vi.mock("@/server/slug", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/slug")>();
  return { ...actual, generateSlug: () => queued.slugs.shift() ?? actual.generateSlug() };
});

import { createModel, findModelBySlug } from "@/server/models";
import { models } from "@/server/schema";
import { isSlug } from "@/server/slug";
import { withTestDatabase } from "../helpers/database";
import type { Database } from "@/server/db";

let database: Database;
let close: () => Promise<void>;

const input = {
  blobUrl: "https://example.public.blob.vercel-storage.com/models/abc.fold",
  blobPathname: "models/abc.fold",
  title: "Book fold",
  frameCount: 2,
  sizeBytes: 1024,
  sha256: "a".repeat(64),
};

beforeEach(async () => {
  ({ database, close } = await withTestDatabase());
});

afterEach(async () => {
  queued.slugs.length = 0;
  await close();
});

describe("createModel", () => {
  it("stores the model under a fresh slug and returns the row", async () => {
    const row = await createModel(input);
    expect(isSlug(row.slug)).toBe(true);
    expect(row.title).toBe("Book fold");
    expect(row.frameCount).toBe(2);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(await database.select().from(models)).toHaveLength(1);
  });

  it("gives every model a different slug", async () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 25; i++) slugs.add((await createModel(input)).slug);
    expect(slugs.size).toBe(25);
  });

  it("accepts a model with no title", async () => {
    const row = await createModel({ ...input, title: null });
    expect(row.title).toBeNull();
  });

  it("retries when a slug is already taken", async () => {
    const existing = await createModel(input);
    queued.slugs.push(existing.slug, "abcdefghjkm");

    const row = await createModel(input);
    expect(row.slug).toBe("abcdefghjkm");
    expect(await database.select().from(models)).toHaveLength(2);
  });

  it("gives up after repeated collisions rather than looping", async () => {
    const existing = await createModel(input);
    queued.slugs.push(existing.slug, existing.slug, existing.slug, existing.slug);
    await expect(createModel(input)).rejects.toThrow();
    expect(await database.select().from(models)).toHaveLength(1);
  });
});

describe("findModelBySlug", () => {
  it("finds a model by its slug", async () => {
    const created = await createModel(input);
    const found = await findModelBySlug(created.slug);
    expect(found?.id).toBe(created.id);
    expect(found?.blobUrl).toBe(input.blobUrl);
  });

  it("returns null for a slug that does not exist", async () => {
    await createModel(input);
    expect(await findModelBySlug("zzzzzzzzzzz")).toBeNull();
  });

  it.each([
    ["a malformed slug", "nope"],
    ["a path traversal attempt", "../../secrets"],
    ["a SQL fragment", "' OR 1=1 --"],
  ])("returns null for %s without querying", async (_label, value) => {
    await createModel(input);
    expect(await findModelBySlug(value)).toBeNull();
  });
});
