import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { setDatabase, type Database } from "@/server/db";
import * as schema from "@/server/schema";

/**
 * An in-process Postgres for the integration tests, running the same migrations as production.
 * Real SQL, no network, no secrets in CI.
 */
export async function withTestDatabase(): Promise<{
  database: Database;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const database = drizzle(client, { schema }) as unknown as Database;

  const sql = readFileSync(join(process.cwd(), "drizzle", "0000_create_models.sql"), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) await client.exec(trimmed);
  }

  setDatabase(database);
  return {
    database,
    close: async () => {
      setDatabase(undefined);
      await client.close();
    },
  };
}
