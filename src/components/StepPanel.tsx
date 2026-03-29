"use client";

import type { ResolvedFrame } from "@/lib/fold-parser";

interface StepPanelProps {
  frame: ResolvedFrame;
}

export default function StepPanel({ frame }: StepPanelProps) {
  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-white">{frame.title}</h2>
      {frame.description && (
        <p className="mt-1 text-sm text-white/60">{frame.description}</p>
      )}
    </div>
  );
}
