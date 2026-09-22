"use client";

import { useMemo } from "react";
import type { ResolvedModel } from "@/fold";
import { buildCreasePattern } from "@/viewer/creasePattern";
import { CREASE_COLORS } from "@/viewer/renderModel";

interface CreasePatternPanelProps {
  model: ResolvedModel;
  frameIndex: number;
  open: boolean;
  onToggle: () => void;
}

/**
 * The flat crease pattern (R6). Always drawn from frame 0's geometry, coloured by the assignments
 * of the step being shown, with the creases that move in that step picked out.
 */
export function CreasePatternPanel({ model, frameIndex, open, onToggle }: CreasePatternPanelProps) {
  const pattern = useMemo(() => buildCreasePattern(model, frameIndex), [model, frameIndex]);
  const activeCount = pattern.edges.filter((edge) => edge.active).length;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-testid="crease-panel-toggle"
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
      >
        {open ? "Hide crease pattern" : "Show crease pattern"}
      </button>

      {open && (
        <div
          className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm"
          data-testid="crease-panel"
        >
          <svg
            viewBox={`0 0 ${pattern.size} ${pattern.size}`}
            className="h-44 w-44"
            role="img"
            aria-label={
              activeCount === 0
                ? "Crease pattern"
                : `Crease pattern, ${activeCount} creases move in this step`
            }
          >
            {/* Inactive creases first, so the ones that move in this step sit on top. */}
            {[false, true].map((layer) =>
              pattern.edges
                .filter((edge) => edge.active === layer)
                .map((edge) => (
                  <line
                    key={edge.id}
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke={`#${CREASE_COLORS[edge.assignment].toString(16).padStart(6, "0")}`}
                    strokeWidth={edge.active ? 3.5 : 1.5}
                    strokeOpacity={edge.active || activeCount === 0 ? 1 : 0.35}
                    strokeLinecap="round"
                    data-edge-id={edge.id}
                    data-assignment={edge.assignment}
                    data-active={edge.active ? "true" : "false"}
                  />
                )),
            )}
          </svg>
          <p className="pt-1 text-center text-xs text-neutral-500" data-testid="crease-panel-note">
            {activeCount === 0
              ? "No creases move yet"
              : `${activeCount} crease${activeCount === 1 ? "" : "s"} move${activeCount === 1 ? "s" : ""} in this step`}
          </p>
        </div>
      )}
    </div>
  );
}
