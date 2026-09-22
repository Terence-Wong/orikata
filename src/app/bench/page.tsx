import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { BenchRunner } from "@/components/BenchRunner";

/**
 * Measures rendered frame rate for each animator, on a fixture at a chosen subdivision level.
 * Available in development, and in a production build only when ORIKATA_DEV_ROUTES is set, so it
 * can be run against a preview deployment on real hardware.
 */
export const dynamic = "force-dynamic";

const FIXTURES = ["book-fold", "book-fold-90", "diagonal-twice", "preliminary-base"] as const;

export default async function BenchPage() {
  if (process.env.NODE_ENV === "production" && process.env.ORIKATA_DEV_ROUTES !== "1") notFound();

  const fixtures = await Promise.all(
    FIXTURES.map(async (name) => ({
      name,
      foldText: await readFile(join(process.cwd(), "fixtures", "valid", `${name}.fold`), "utf8"),
    })),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Animator benchmark</h1>
        <p className="text-sm text-neutral-600">
          Runs every step of the chosen model under each animator and records the rendered frame
          rate. Subdividing splits every face into four, so each level multiplies the vertex count.
        </p>
      </div>
      <BenchRunner fixtures={fixtures} />
    </main>
  );
}
