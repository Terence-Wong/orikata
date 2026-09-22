import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = join(process.cwd(), "fixtures");

export const VALID_FIXTURES = [
  "book-fold",
  "book-fold-90",
  "diagonal-twice",
  "preliminary-base",
] as const;
export type ValidFixture = (typeof VALID_FIXTURES)[number];

export function fixturePath(kind: "valid" | "invalid", name: string): string {
  return join(FIXTURES_DIR, kind, `${name}.fold`);
}

export function readFixture(kind: "valid" | "invalid", name: string): string {
  return readFileSync(fixturePath(kind, name), "utf8");
}
