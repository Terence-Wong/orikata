"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/lib/api";

export default function UploadPage() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".fold")) {
        setError("Please select a .fold file");
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const { slug } = await uploadFile(file);
        router.push(`/view/${slug}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setUploading(false);
      }
    },
    [router]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold mb-2">Orikata</h1>
        <p className="text-foreground/60 mb-8">
          Upload a .fold file to get a shareable 3D folding viewer
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`block border-2 border-dashed rounded-xl p-12 cursor-pointer transition-colors ${
            dragging
              ? "border-blue-500 bg-blue-500/10"
              : "border-foreground/20 hover:border-foreground/40"
          } ${uploading ? "pointer-events-none opacity-50" : ""}`}
        >
          <input
            type="file"
            accept=".fold"
            onChange={handleInputChange}
            className="hidden"
            disabled={uploading}
          />
          {uploading ? (
            <p className="text-foreground/60">Uploading...</p>
          ) : (
            <>
              <p className="text-lg mb-1">Drop a .fold file here</p>
              <p className="text-sm text-foreground/50">or click to browse</p>
            </>
          )}
        </label>

        {error && (
          <p className="mt-4 text-red-500 text-sm">{error}</p>
        )}
      </div>
    </main>
  );
}
