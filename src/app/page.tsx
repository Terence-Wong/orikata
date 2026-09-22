import { UploadForm } from "@/components/UploadForm";
import { usingLocalBackend } from "@/server/localBackend";

// Where uploads go is decided at request time, so development and the end-to-end tests can use
// the local store without rebuilding.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">Orikata</h1>
        <p className="text-neutral-600">
          Upload a multi-frame FOLD file and get a link to a step-by-step 3D animation of the model
          being folded. No account needed.
        </p>
      </div>
      <UploadForm uploadMode={usingLocalBackend() ? "local" : "blob"} />
    </main>
  );
}
