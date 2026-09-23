import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { parseAnimatorName } from "@/animation/registry";
import { Viewer } from "@/components/Viewer";

/**
 * Renders a committed fixture in the viewer, with no upload or database. Available in development,
 * and in a production build only when ORIKATA_DEV_ROUTES is set (CI uses it for screenshots).
 */
export const dynamic = "force-dynamic";

const FIXTURES = ["book-fold", "book-fold-90", "diagonal-twice", "preliminary-base"] as const;

function devRoutesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ORIKATA_DEV_ROUTES === "1";
}

export default async function DevFixturePage({
  params,
  searchParams,
}: {
  params: Promise<{ fixture: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { fixture } = await params;
  // Undefined unless ?animator= asked for one, in which case the model size decides.
  const animator = parseAnimatorName((await searchParams).animator);
  if (!devRoutesEnabled() || !(FIXTURES as readonly string[]).includes(fixture)) notFound();

  const foldText = await readFile(
    join(process.cwd(), "fixtures", "valid", `${fixture}.fold`),
    "utf8",
  );

  return (
    <main className="mx-auto flex h-screen max-w-4xl flex-col p-6">
      <p className="pb-3 text-xs tracking-wide text-neutral-400 uppercase">fixture · {fixture}</p>
      <Viewer foldText={foldText} animator={animator} />
    </main>
  );
}
