"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { loadFold } from "@/fold";
import { uploadFoldFile, type UploadMode } from "@/lib/uploadFile";
import { LOAD_LIMITS, MAX_FILE_BYTES } from "@/server/limits";

type Status = "idle" | "checking" | "uploading" | "creating";

const MEGABYTES = MAX_FILE_BYTES / (1024 * 1024);

export function UploadForm({ uploadMode }: { uploadMode: UploadMode }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const handle = useCallback(
    async (file: File) => {
      setErrors([]);
      setStatus("checking");

      if (file.size > MAX_FILE_BYTES) {
        setErrors([
          `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MEGABYTES} MB.`,
        ]);
        setStatus("idle");
        return;
      }

      // Validate before uploading, so a bad file never leaves the browser.
      const text = await file.text();
      const loaded = loadFold(text, { limits: LOAD_LIMITS });
      if (!loaded.ok) {
        setErrors(loaded.errors.map((error) => error.message));
        setStatus("idle");
        return;
      }

      try {
        setStatus("uploading");
        const blob = await uploadFoldFile(
          file,
          { size: file.size, frameCount: loaded.model.frames.length },
          uploadMode,
        );

        setStatus("creating");
        const response = await fetch("/api/models", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blobUrl: blob.url, filename: file.name }),
        });
        const body = (await response.json()) as { slug?: string; error?: string };
        if (!response.ok || !body.slug) {
          setErrors([body.error ?? "That file could not be saved. Please try again."]);
          setStatus("idle");
          return;
        }
        router.push(`/view/${body.slug}`);
      } catch (cause) {
        setErrors([
          cause instanceof Error ? cause.message : "The upload failed. Please try again.",
        ]);
        setStatus("idle");
      }
    },
    [router, uploadMode],
  );

  const busy = status !== "idle";

  return (
    <div className="flex w-full flex-col gap-4" data-testid="upload" data-status={status}>
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file && !busy) void handle(file);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? "border-neutral-500 bg-neutral-50" : "border-neutral-300"
        } ${busy ? "pointer-events-none opacity-60" : "hover:border-neutral-400"}`}
      >
        <span className="text-base font-medium text-neutral-800">
          {busy ? statusLabel(status) : "Choose a .fold file, or drop one here"}
        </span>
        <span className="text-sm text-neutral-500">
          Multi-frame FOLD files up to {MEGABYTES} MB. Anyone with the link can view the result.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".fold,application/json"
          disabled={busy}
          className="sr-only"
          data-testid="upload-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear the input so choosing the same file twice still fires a change.
            event.target.value = "";
            if (file) void handle(file);
          }}
        />
      </label>

      {errors.length > 0 && (
        <div
          role="alert"
          data-testid="upload-error"
          className="rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <h2 className="text-sm font-semibold text-red-900">
            {errors.length === 1
              ? "That file could not be opened"
              : "That file has several problems"}
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function statusLabel(status: Status): string {
  if (status === "checking") return "Checking the file…";
  if (status === "uploading") return "Uploading…";
  return "Almost there…";
}
