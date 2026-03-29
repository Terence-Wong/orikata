export interface ModelResponse {
  slug: string;
  filename: string;
  createdAt: string;
  fold: Record<string, unknown>;
}

export async function uploadFile(file: File): Promise<{ slug: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Upload failed");
  }

  return res.json();
}

export async function fetchModel(slug: string): Promise<ModelResponse> {
  const res = await fetch(`/api/models/${slug}`);

  if (!res.ok) {
    if (res.status === 404) throw new Error("Model not found");
    throw new Error("Failed to fetch model");
  }

  return res.json();
}
