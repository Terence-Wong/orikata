import { describe, expect, it } from "vitest";
import { parseFoldText } from "@/fold/parse";

describe("parseFoldText", () => {
  it("returns the parsed object for valid JSON objects", () => {
    const result = parseFoldText('{"file_spec": 1.1, "vertices_coords": []}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.file_spec).toBe(1.1);
  });

  it("rejects malformed JSON with INVALID_JSON and a user-facing message", () => {
    const result = parseFoldText('{"file_spec": 1.1, ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_JSON");
    expect(result.error.message).toMatch(/not valid JSON/i);
  });

  it.each([
    ["an array", "[1, 2, 3]"],
    ["a string", '"hello"'],
    ["null", "null"],
    ["empty text", ""],
  ])("rejects %s because a FOLD file must be a JSON object", (_label, text) => {
    const result = parseFoldText(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_JSON");
  });
});
