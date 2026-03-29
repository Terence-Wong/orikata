import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { parseFoldFile, validateFileSize, FoldParseError } from "@/lib/fold-parser";
import { insertModel } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const bytes = new TextEncoder().encode(text).length;

    if (!validateFileSize(bytes)) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    // Validate it's a valid FOLD file
    try {
      parseFoldFile(text);
    } catch (e) {
      if (e instanceof FoldParseError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const slug = nanoid(8);
    const filename = file instanceof File ? file.name : `${slug}.fold`;

    // Store in Vercel Blob
    const blob = await put(`models/${slug}.fold`, text, {
      access: "public",
      contentType: "application/json",
    });

    // Insert into database
    await insertModel(slug, blob.url, filename, bytes);

    return NextResponse.json({ slug });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
