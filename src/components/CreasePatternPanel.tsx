"use client";

import { useMemo } from "react";
import type { ResolvedFrame, FrameDiff } from "@/lib/fold-parser";

interface CreasePatternPanelProps {
  /** Frame 0 (the crease pattern) */
  baseFrame: ResolvedFrame;
  /** Current frame diff (edges newly active in current step) */
  diff: FrameDiff | null;
}

const ASSIGNMENT_COLORS: Record<string, string> = {
  M: "#e63946",
  V: "#457b9d",
  B: "#2d3436",
  F: "#666666",
  U: "#666666",
};

export default function CreasePatternPanel({ baseFrame, diff }: CreasePatternPanelProps) {
  const { viewBox, edges } = useMemo(() => {
    const coords = baseFrame.vertices_coords;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const c of coords) {
      minX = Math.min(minX, c[0]);
      minY = Math.min(minY, c[1]);
      maxX = Math.max(maxX, c[0]);
      maxY = Math.max(maxY, c[1]);
    }

    const pad = (maxX - minX) * 0.05 || 0.05;
    const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;

    const newlyActive = new Set(diff?.newlyActiveEdges ?? []);

    const edgeData = baseFrame.edges_vertices.map((edge, i) => {
      const [v0, v1] = edge;
      const assignment = baseFrame.edges_assignment[i];
      return {
        x1: coords[v0][0],
        y1: coords[v0][1],
        x2: coords[v1][0],
        y2: coords[v1][1],
        color: ASSIGNMENT_COLORS[assignment] ?? ASSIGNMENT_COLORS.U,
        isNewlyActive: newlyActive.has(i),
        assignment,
      };
    });

    return { viewBox: vb, edges: edgeData };
  }, [baseFrame, diff]);

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-white/70 mb-2">Crease Pattern</h3>
      <svg
        viewBox={viewBox}
        className="w-full h-auto bg-white/5 rounded-lg"
        style={{ maxHeight: 200 }}
      >
        {edges.map((e, i) => (
          <line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={e.color}
            strokeWidth={e.isNewlyActive ? 0.015 : 0.005}
            strokeOpacity={e.isNewlyActive ? 1 : 0.5}
          />
        ))}
      </svg>
    </div>
  );
}
