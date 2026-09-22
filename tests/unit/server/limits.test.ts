import { describe, expect, it } from "vitest";
import { BLOB_PATHNAME_PATTERN, MAX_FILE_BYTES } from "@/server/limits";

describe("BLOB_PATHNAME_PATTERN", () => {
  it("accepts the pathnames the client generates", () => {
    expect(BLOB_PATHNAME_PATTERN.test(`models/${crypto.randomUUID()}.fold`)).toBe(true);
  });

  it.each([
    ["a different folder", "uploads/abcdefghijklmnopqrst.fold"],
    ["a traversal attempt", "models/../../etc/passwd.fold"],
    ["no extension", "models/abcdefghijklmnopqrst"],
    ["another extension", "models/abcdefghijklmnopqrst.js"],
    ["a name that is too short", "models/abc.fold"],
    ["uppercase hex", "models/ABCDEFGHIJKLMNOPQRST.fold"],
  ])("rejects %s", (_label, pathname) => {
    expect(BLOB_PATHNAME_PATTERN.test(pathname)).toBe(false);
  });
});

describe("MAX_FILE_BYTES", () => {
  it("is the 5 MB cap from the plan", () => {
    expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
  });
});
