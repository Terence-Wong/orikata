"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const subscribeToNothing = () => () => {};

/** Copies the page's own URL, which is the whole sharing mechanism. */
export function ShareLink({ slug }: { slug: string }) {
  // The origin is only known in the browser; on the server the field renders empty.
  const origin = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );
  const url = origin ? `${origin}/view/${slug}` : "";
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
        aria-label="Link to this model"
        data-testid="share-url"
        className="w-52 truncate rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-600 sm:w-80"
      />
      <button
        type="button"
        data-testid="share-copy"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
