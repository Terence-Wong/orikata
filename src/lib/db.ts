import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";

export const models = pgTable("models", {
  slug: text("slug").primaryKey(),
  blobUrl: text("blob_url").notNull(),
  filename: text("filename").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql);
}

export async function insertModel(slug: string, blobUrl: string, filename: string, fileSize: number) {
  const db = getDb();
  await db.insert(models).values({ slug, blobUrl, filename, fileSize });
}

export async function getModel(slug: string) {
  const db = getDb();
  const rows = await db.select().from(models).where(eq(models.slug, slug)).limit(1);
  return rows[0] ?? null;
}
