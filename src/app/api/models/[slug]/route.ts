import { NextRequest, NextResponse } from "next/server";
import { getModel } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const model = await getModel(slug);

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // Fetch the .fold file from Vercel Blob
    const response = await fetch(model.blobUrl);
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch model data" }, { status: 500 });
    }

    const foldData = await response.json();
    return NextResponse.json({
      slug: model.slug,
      filename: model.filename,
      createdAt: model.createdAt,
      fold: foldData,
    });
  } catch (error) {
    console.error("Fetch model error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
