import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseAnimatorName } from "@/animation/registry";
import { Viewer } from "@/components/Viewer";
import { findExample } from "@/examples";

export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const example = findExample((await params).name);
  return { title: example ? `${example.title} · Orikata` : "Orikata" };
}

/** A model bundled with the app, so there is something to look at without uploading a file. */
export default async function ExamplePage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const example = findExample((await params).name);
  if (!example) notFound();
  const animator = parseAnimatorName((await searchParams).animator);

  const foldText = await readFile(
    join(process.cwd(), "fixtures", "valid", `${example.name}.fold`),
    "utf8",
  );

  return (
    <main className="mx-auto flex h-screen max-w-4xl flex-col p-6">
      <div className="flex items-baseline justify-between gap-4 pb-3">
        <Link href="/" className="text-sm font-medium text-neutral-500 hover:text-neutral-800">
          Orikata
        </Link>
        <span className="text-xs tracking-wide text-neutral-400 uppercase">example</span>
      </div>
      <Viewer foldText={foldText} title={example.title} animator={animator} />
    </main>
  );
}
