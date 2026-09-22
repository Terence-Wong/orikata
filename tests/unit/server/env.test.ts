import { describe, expect, it } from "vitest";
import { databaseUrl } from "@/server/env";

describe("env", () => {
  it("reads a variable", () => {
    process.env.DATABASE_URL = "postgres://x";
    expect(databaseUrl()).toBe("postgres://x");
  });
  it("fails clearly when unset", () => {
    delete process.env.DATABASE_URL;
    expect(() => databaseUrl()).toThrow(/DATABASE_URL is not set/);
  });
});
