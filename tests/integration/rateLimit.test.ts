import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  checkRateLimit,
  clientAddress,
  GLOBAL_LIMIT_PER_DAY,
  hashAddress,
  RATE_LIMIT_PER_HOUR,
} from "@/server/rateLimit";
import { uploadAttempts } from "@/server/schema";
import { withTestDatabase } from "../helpers/database";
import type { Database } from "@/server/db";

let database: Database;
let close: () => Promise<void>;

function request(address = "203.0.113.7"): Request {
  return new Request("https://orikata.test/api/upload", { headers: { "x-real-ip": address } });
}

/** Backdates every attempt so a test can put them outside the window. */
async function ageAttempts(minutes: number) {
  await database.execute(
    sql`update upload_attempts set created_at = created_at - ${`${minutes} minutes`}::interval`,
  );
}

beforeEach(async () => {
  process.env.RATE_LIMIT_SALT = "test-salt";
  ({ database, close } = await withTestDatabase());
});

afterEach(async () => {
  await close();
});

describe("clientAddress", () => {
  it("prefers x-real-ip", () => {
    expect(clientAddress(request("198.51.100.4"))).toBe("198.51.100.4");
  });

  it("falls back to the first entry of x-forwarded-for", () => {
    const forwarded = new Request("https://orikata.test", {
      headers: { "x-forwarded-for": "198.51.100.9, 10.0.0.1" },
    });
    expect(clientAddress(forwarded)).toBe("198.51.100.9");
  });

  it("uses one bucket when the address is unknown", () => {
    expect(clientAddress(new Request("https://orikata.test"))).toBe("unknown");
  });
});

describe("hashAddress", () => {
  it("is stable for the same address and different for others", () => {
    expect(hashAddress("203.0.113.7")).toBe(hashAddress("203.0.113.7"));
    expect(hashAddress("203.0.113.7")).not.toBe(hashAddress("203.0.113.8"));
  });

  it("does not contain the address", () => {
    expect(hashAddress("203.0.113.7")).not.toContain("203.0.113.7");
    expect(hashAddress("203.0.113.7")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("depends on the salt, so hashes are not comparable across deployments", () => {
    const withOneSalt = hashAddress("203.0.113.7");
    process.env.RATE_LIMIT_SALT = "another-salt";
    expect(hashAddress("203.0.113.7")).not.toBe(withOneSalt);
  });
});

describe("checkRateLimit", () => {
  it("allows attempts up to the limit and records each one", async () => {
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) {
      expect((await checkRateLimit(request(), "token")).allowed).toBe(true);
    }
    expect(await database.select().from(uploadAttempts)).toHaveLength(RATE_LIMIT_PER_HOUR);
  });

  it("blocks the next attempt from the same address and does not record it", async () => {
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) await checkRateLimit(request(), "token");
    const blocked = await checkRateLimit(request(), "token");
    expect(blocked).toEqual({ allowed: false, reason: "per-ip" });
    expect(await database.select().from(uploadAttempts)).toHaveLength(RATE_LIMIT_PER_HOUR);
  });

  it("counts each kind of request separately", async () => {
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) await checkRateLimit(request(), "token");
    expect((await checkRateLimit(request(), "create")).allowed).toBe(true);
  });

  it("does not let one address block another", async () => {
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++)
      await checkRateLimit(request("203.0.113.7"), "token");
    expect((await checkRateLimit(request("198.51.100.4"), "token")).allowed).toBe(true);
  });

  it("forgets attempts once they fall outside the window", async () => {
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) await checkRateLimit(request(), "token");
    expect((await checkRateLimit(request(), "token")).allowed).toBe(false);
    await ageAttempts(61);
    expect((await checkRateLimit(request(), "token")).allowed).toBe(true);
  });

  it("stops everyone once the day's global ceiling is reached", async () => {
    const rows = Array.from({ length: GLOBAL_LIMIT_PER_DAY }, (_, i) => ({
      ipHash: `hash-${i}`,
      kind: "create",
    }));
    await database.insert(uploadAttempts).values(rows);
    expect(await checkRateLimit(request("198.51.100.4"), "create")).toEqual({
      allowed: false,
      reason: "global",
    });
  });

  it("counts only creations towards the global ceiling", async () => {
    const rows = Array.from({ length: GLOBAL_LIMIT_PER_DAY }, (_, i) => ({
      ipHash: `hash-${i}`,
      kind: "token",
    }));
    await database.insert(uploadAttempts).values(rows);
    expect((await checkRateLimit(request("198.51.100.4"), "create")).allowed).toBe(true);
  });

  it("lifts the global ceiling once the day has passed", async () => {
    const rows = Array.from({ length: GLOBAL_LIMIT_PER_DAY }, (_, i) => ({
      ipHash: `hash-${i}`,
      kind: "create",
    }));
    await database.insert(uploadAttempts).values(rows);
    await ageAttempts(24 * 60 + 1);
    expect((await checkRateLimit(request("198.51.100.4"), "create")).allowed).toBe(true);
  });
});
