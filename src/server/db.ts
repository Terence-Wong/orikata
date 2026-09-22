import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { databaseUrl } from "./env";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

/**
 * Next bundles the instrumentation hook and the route handlers into separate module graphs, so a
 * module-level variable set by one is not visible to the other. The handle lives on globalThis so
 * the local backend can install it once at startup.
 */
const SLOT = Symbol.for("orikata.database");

interface DatabaseSlot {
  [SLOT]?: Database;
}

/**
 * The request-time database handle. Neon's HTTP driver suits serverless functions: no pool to keep
 * alive between invocations. The local backend and the tests substitute PGlite with `setDatabase`.
 */
export function db(): Database {
  const slot = globalThis as DatabaseSlot;
  if (!slot[SLOT]) slot[SLOT] = drizzle(neon(databaseUrl()), { schema });
  return slot[SLOT];
}

/** Installs a database handle, or clears it so the next call builds one from the environment. */
export function setDatabase(database: Database | undefined): void {
  const slot = globalThis as DatabaseSlot;
  if (database) slot[SLOT] = database;
  else delete slot[SLOT];
}
