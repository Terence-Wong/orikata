import {
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** One uploaded model. The slug is the only access control: anyone with the link can view it. */
export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    blobUrl: text("blob_url").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    title: text("title"),
    frameCount: integer("frame_count").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("models_slug_key").on(table.slug)],
);

/**
 * One row per upload attempt, for rate limiting. Only a salted hash of the IP is kept, and rows
 * are deleted after a day by the cleanup cron.
 */
export const uploadAttempts = pgTable(
  "upload_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ipHash: text("ip_hash").notNull(),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("upload_attempts_ip_created_idx").on(table.ipHash, table.createdAt)],
);

export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
