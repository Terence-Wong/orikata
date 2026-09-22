import { describe, expect, it } from "vitest";
import { generateSlug, isSlug, SLUG_ALPHABET, SLUG_LENGTH } from "@/server/slug";

describe("generateSlug", () => {
  it("is the configured length and uses only the configured alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const slug = generateSlug();
      expect(slug).toHaveLength(SLUG_LENGTH);
      expect([...slug].every((character) => SLUG_ALPHABET.includes(character))).toBe(true);
    }
  });

  it("leaves out characters that are easy to confuse when read aloud", () => {
    for (const character of ["0", "1", "o", "i", "l"]) {
      expect(SLUG_ALPHABET).not.toContain(character);
    }
  });

  it("gives enough room that guessing a slug is hopeless", () => {
    // 31^11 is about 2^54, so an attacker gains nothing from enumeration.
    expect(Math.log2(SLUG_ALPHABET.length ** SLUG_LENGTH)).toBeGreaterThan(50);
  });

  it("does not repeat over a large sample", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100_000; i++) seen.add(generateSlug());
    expect(seen.size).toBe(100_000);
  });

  it("is not sequential: consecutive slugs share no common prefix", () => {
    let sharedPrefixes = 0;
    let previous = generateSlug();
    for (let i = 0; i < 1000; i++) {
      const slug = generateSlug();
      if (slug[0] === previous[0] && slug[1] === previous[1]) sharedPrefixes += 1;
      previous = slug;
    }
    // Two random characters from a 31-letter alphabet collide about 1 time in 961.
    expect(sharedPrefixes).toBeLessThan(15);
  });
});

describe("isSlug", () => {
  it("accepts slugs it generated", () => {
    for (let i = 0; i < 50; i++) expect(isSlug(generateSlug())).toBe(true);
  });

  it.each([
    ["too short", "abc"],
    ["too long", "abcdefghijklmnop"],
    ["an excluded character", "0bcdefghijk"],
    ["an uppercase character", "Abcdefghijk"],
    ["a hyphen", "abcdefghij-"],
    ["empty", ""],
    ["a path traversal attempt", "../../etc/pa"],
  ])("rejects %s", (_label, value) => {
    expect(isSlug(value)).toBe(false);
  });
});
