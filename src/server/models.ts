import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { models, type Model, type NewModel } from "./schema";
import { generateSlug, isSlug } from "./slug";

/** How many times a slug collision is retried before giving up. At 2^54 slugs this never happens. */
const SLUG_ATTEMPTS = 3;

export type CreateModelInput = Omit<NewModel, "id" | "slug" | "createdAt">;

/**
 * Stores a model under a fresh slug. The unique index is the authority: on the (vanishingly
 * unlikely) collision the insert fails and another slug is drawn.
 */
export async function createModel(input: CreateModelInput): Promise<Model> {
  const database = db();
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    try {
      const [row] = await database
        .insert(models)
        .values({ ...input, slug: generateSlug() })
        .returning();
      if (row) return row;
    } catch (cause) {
      if (attempt === SLUG_ATTEMPTS - 1 || !isUniqueViolation(cause)) throw cause;
    }
  }
  throw new Error("could not allocate a slug");
}

/** The model behind a slug, or null. Malformed slugs never reach the database. */
export async function findModelBySlug(slug: string): Promise<Model | null> {
  if (!isSlug(slug)) return null;
  const [row] = await db().select().from(models).where(eq(models.slug, slug)).limit(1);
  return row ?? null;
}

/**
 * Whether an error is Postgres's unique_violation (23505). Drizzle wraps driver errors, so the
 * code is on the cause rather than the error it throws; the chain is walked to find it.
 */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (typeof current !== "object") break;
    if ((current as { code?: unknown }).code === "23505") return true;
    const message = current instanceof Error ? current.message : "";
    if (message.includes("duplicate key value") || message.includes("models_slug_key")) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
