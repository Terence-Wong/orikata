import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { databaseUrl } from "./env";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

let cached: Database | undefined;

/**
 * The request-time database handle. Neon's HTTP driver suits serverless functions: no pool to keep
 * alive between invocations. Tests substitute an in-process Postgres with `setDatabase`.
 */
export function db(): Database {
  if (!cached) cached = drizzle(neon(databaseUrl()), { schema });
  return cached;
}

/** Used by the tests to run against PGlite instead of Neon. */
export function setDatabase(database: Database | undefined): void {
  cached = database;
}
