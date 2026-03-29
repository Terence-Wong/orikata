"use client";

import { useState, useEffect } from "react";
import { fetchModel } from "@/lib/api";
import { parseFoldFile, resolveAllFrames } from "@/lib/fold-parser";
import type { ResolvedFrame, FoldFile } from "@/lib/fold-parser";

interface UseFoldModelResult {
  frames: ResolvedFrame[];
  filename: string | null;
  loading: boolean;
  error: string | null;
}

export function useFoldModel(slug: string): UseFoldModelResult {
  const [frames, setFrames] = useState<ResolvedFrame[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const data = await fetchModel(slug);
        if (cancelled) return;

        setFilename(data.filename);

        // The API returns the raw FOLD object; resolve all frames
        const foldFile = data.fold as unknown as FoldFile;
        const resolved = resolveAllFrames(foldFile);

        if (resolved.length === 0) {
          throw new Error("No frames found in .fold file");
        }

        setFrames(resolved);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load model");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { frames, filename, loading, error };
}
