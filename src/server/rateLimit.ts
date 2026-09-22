import "server-only";
import { createHash } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "./db";
import { rateLimitSalt } from "./env";
import { uploadAttempts } from "./schema";

/** Attempts allowed per IP per window, for each kind of request. */
export const RATE_LIMIT_PER_HOUR = 20;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
/** Uploads are open to anyone, so a global ceiling bounds the worst day. */
export const GLOBAL_LIMIT_PER_DAY = 500;
export const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Attempt rows are only needed for the windows above; the cleanup cron drops older ones. */
export const ATTEMPT_RETENTION_MS = GLOBAL_WINDOW_MS;

export type AttemptKind = "token" | "create";

export interface RateLimitResult {
  allowed: boolean;
  reason?: "per-ip" | "global";
}

/** The client's address as Vercel reports it. Unknown addresses share one bucket. */
export function clientAddress(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Addresses are never stored: only a salted hash, which is enough to count attempts. */
export function hashAddress(address: string): string {
  return createHash("sha256").update(`${rateLimitSalt()}:${address}`).digest("hex");
}

/**
 * Records an attempt and says whether it is allowed. Both limits are sliding windows over the
 * `upload_attempts` table, so there is no extra service to run.
 */
export async function checkRateLimit(
  request: Request,
  kind: AttemptKind,
): Promise<RateLimitResult> {
  const database = db();
  const ipHash = hashAddress(clientAddress(request));
  const now = Date.now();

  const [perIp] = await database
    .select({ value: count() })
    .from(uploadAttempts)
    .where(
      and(
        eq(uploadAttempts.ipHash, ipHash),
        eq(uploadAttempts.kind, kind),
        gte(uploadAttempts.createdAt, new Date(now - RATE_LIMIT_WINDOW_MS)),
      ),
    );
  if ((perIp?.value ?? 0) >= RATE_LIMIT_PER_HOUR) return { allowed: false, reason: "per-ip" };

  const [global] = await database
    .select({ value: count() })
    .from(uploadAttempts)
    .where(
      and(
        eq(uploadAttempts.kind, "create"),
        gte(uploadAttempts.createdAt, new Date(now - GLOBAL_WINDOW_MS)),
      ),
    );
  if ((global?.value ?? 0) >= GLOBAL_LIMIT_PER_DAY) return { allowed: false, reason: "global" };

  await database.insert(uploadAttempts).values({ ipHash, kind });
  return { allowed: true };
}
