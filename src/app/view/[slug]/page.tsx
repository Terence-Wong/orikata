import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareLink } from "@/components/ShareLink";
import { Viewer } from "@/components/Viewer";
import { parseAnimatorName } from "@/animation/registry";
import { findModelBySlug } from "@/server/models";

export const runtime = "nodejs";

/** Anyone with the link can view the model; the slug is the only access control. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const model = await findModelBySlug((await params).slug);
  const title = model?.title ?? "Folded model";
  return { title: `${title} · Orikata`, robots: { index: false, follow: false } };
}

export default async function ViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  // Without ?animator=, the model's size decides which one runs.
  const animator = parseAnimatorName((await searchParams).animator);
  const model = await findModelBySlug(slug);
  if (!model) notFound();

  const response = await fetch(model.blobUrl, { next: { revalidate: 3600 } });
  if (!response.ok) notFound();
  const foldText = await response.text();

  return (
    <main className="mx-auto flex h-screen max-w-4xl flex-col p-6">
      <div className="flex items-center justify-between gap-4 pb-3">
        <Link href="/" className="text-sm font-medium text-neutral-500 hover:text-neutral-800">
          Orikata
        </Link>
        <ShareLink slug={slug} />
      </div>
      <Viewer foldText={foldText} title={model.title ?? undefined} animator={animator} />
    </main>
  );
}
