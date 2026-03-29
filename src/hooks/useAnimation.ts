"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ResolvedFrame } from "@/lib/fold-parser";
import { VertexInterpolator } from "@/lib/solver";

const ANIMATION_DURATION_MS = 800;

interface UseAnimationResult {
  /** The current vertex positions as a flat array (x,y,z,x,y,z,...) */
  positions: Float32Array | null;
  /** Whether an animation is currently playing */
  animating: boolean;
  /** Trigger a transition from one frame to another */
  transitionTo: (from: ResolvedFrame, to: ResolvedFrame) => void;
  /** Cancel any in-progress animation */
  cancel: () => void;
}

export function useAnimation(): UseAnimationResult {
  const [positions, setPositions] = useState<Float32Array | null>(null);
  const [animating, setAnimating] = useState(false);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const interpolatorRef = useRef<VertexInterpolator | null>(null);

  const cancel = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    interpolatorRef.current = null;
    setAnimating(false);
  }, []);

  const transitionTo = useCallback(
    (from: ResolvedFrame, to: ResolvedFrame) => {
      // Cancel any existing animation
      cancel();

      // If vertex counts don't match, skip animation
      if (from.vertices_coords.length !== to.vertices_coords.length) {
        setPositions(null);
        return;
      }

      const interpolator = new VertexInterpolator(
        from.vertices_coords,
        to.vertices_coords,
        from.edges_vertices
      );
      interpolatorRef.current = interpolator;
      startTimeRef.current = performance.now();
      setAnimating(true);

      function tick(now: number) {
        const elapsed = now - startTimeRef.current;
        const t = Math.min(1, elapsed / ANIMATION_DURATION_MS);

        const pos = interpolator.evaluate(t);
        setPositions(pos);

        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          interpolatorRef.current = null;
          setAnimating(false);
          // Set positions to null so the viewer uses the target frame's native geometry
          setPositions(null);
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    },
    [cancel]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return { positions, animating, transitionTo, cancel };
}
