import { findModelBySlug } from "@/server/models";

export const runtime = "nodejs";

/** Metadata for a model. The FOLD file itself is fetched from Blob by the viewer. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params;
  const model = await findModelBySlug(slug);
  if (!model) return Response.json({ error: "No model here." }, { status: 404 });

  return Response.json({
    slug: model.slug,
    blobUrl: model.blobUrl,
    title: model.title,
    frameCount: model.frameCount,
    sizeBytes: model.sizeBytes,
    createdAt: model.createdAt.toISOString(),
  });
}
