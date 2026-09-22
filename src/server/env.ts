import "server-only";

/**
 * Environment the server needs. Each value is read where it is used rather than at import time, so
 * a missing variable fails the request that needs it with a clear message instead of the build.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function databaseUrl(): string {
  return required("DATABASE_URL");
}

export function blobToken(): string {
  return required("BLOB_READ_WRITE_TOKEN");
}

/** Salt for the hashed IPs in `upload_attempts`, so the table never holds an address. */
export function rateLimitSalt(): string {
  return required("RATE_LIMIT_SALT");
}

export function cronSecret(): string {
  return required("CRON_SECRET");
}
