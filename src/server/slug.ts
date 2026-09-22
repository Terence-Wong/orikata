import { customAlphabet } from "nanoid";

/**
 * Lowercase letters and digits, without the characters that are easy to confuse when a link is
 * read aloud or copied by hand: 0/o, 1/i/l.
 */
export const SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const SLUG_LENGTH = 11;

const nanoid = customAlphabet(SLUG_ALPHABET, SLUG_LENGTH);

/** A short, unguessable, non-sequential id. nanoid draws from the platform's CSPRNG. */
export function generateSlug(): string {
  return nanoid();
}

const SLUG_PATTERN = new RegExp(`^[${SLUG_ALPHABET}]{${SLUG_LENGTH}}$`);

/** Whether a string could be one of our slugs. Checked before it ever reaches the database. */
export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
