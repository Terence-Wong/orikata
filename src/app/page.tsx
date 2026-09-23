import Link from "next/link";
import { UploadForm } from "@/components/UploadForm";
import { EXAMPLES } from "@/examples";
import { usingLocalBackend } from "@/server/localBackend";

// Where uploads go is decided at request time, so development and the end-to-end tests can use
// the local store without rebuilding.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-10 p-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">Orikata</h1>
        <p className="text-neutral-600">
          Upload a multi-frame FOLD file and get a link to a step-by-step 3D animation of the model
          being folded. No account needed.
        </p>
      </div>

      <UploadForm uploadMode={usingLocalBackend() ? "local" : "blob"} />

      <section className="flex flex-col gap-3" data-testid="examples">
        <h2 className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
          Or look at an example
        </h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {EXAMPLES.map((example) => (
            <li key={example.name}>
              <Link
                href={`/examples/${example.name}`}
                data-testid={`example-${example.name}`}
                className="flex flex-col gap-0.5 px-4 py-3 hover:bg-neutral-50"
              >
                <span className="text-sm font-medium text-neutral-900">{example.title}</span>
                <span className="text-sm text-neutral-500">{example.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
