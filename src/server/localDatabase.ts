import "server-only";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setDatabase, type Database } from "./db";
import { LOCAL_BACKEND_DIR } from "./localBackend";
import * as schema from "./schema";

/**
 * Brings up PGlite in this process and applies the committed migrations. PGlite is a development
 * dependency, so it is imported dynamically: a deployment never reaches this code.
 */
export async function startLocalDatabase(): Promise<void> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");

  // "memory" gives a database that starts empty every run, which is what the e2e suite wants.
  const configured = process.env.ORIKATA_LOCAL_PGDATA?.trim();
  const dataDir = configured || join(process.cwd(), LOCAL_BACKEND_DIR, "pgdata");
  if (dataDir !== "memory") await mkdir(dataDir, { recursive: true });
  const client = new PGlite(dataDir === "memory" ? undefined : dataDir);
  await client.waitReady;

  const migrations = join(process.cwd(), "drizzle");
  const files = (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(join(migrations, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      // Migrations are re-applied on every start, so an existing table is not an error.
      await client.exec(trimmed).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("already exists")) throw error;
      });
    }
  }

  setDatabase(drizzle(client, { schema }) as unknown as Database);
}
