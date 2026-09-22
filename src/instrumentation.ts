/**
 * Runs once when the server starts. With the local backend on, this brings up an in-process
 * Postgres and applies the migrations, so `pnpm dev` and the end-to-end tests need no Neon
 * database and no credentials.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { usingLocalBackend } = await import("@/server/localBackend");
  if (!usingLocalBackend()) return;
  const { startLocalDatabase } = await import("@/server/localDatabase");
  await startLocalDatabase();
}
