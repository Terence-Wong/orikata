"use client";

import { useCallback, useRef, useState } from "react";
import { subdivide } from "@/animation/metrics";
import { createAnimator, type AnimatorName } from "@/animation/registry";
import { loadFold, type ResolvedModel } from "@/fold";
import { ViewerController } from "@/viewer/controller";
import type { ViewerScene } from "@/viewer/scene";

const ANIMATORS: AnimatorName[] = ["lerp", "solver"];
const SUBDIVISIONS = [0, 1, 2, 3, 4, 5];
const DEFAULT_MAX_SUBDIVISION = 5;

interface Result {
  fixture: string;
  subdivision: number;
  vertices: number;
  animator: AnimatorName;
  frames: number;
  avgFps: number;
  minFps: number;
  p5Fps: number;
}

export function BenchRunner({ fixtures }: { fixtures: { name: string; foldText: string }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fixture, setFixture] = useState(fixtures.at(-1)?.name ?? "");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [maxSubdivision, setMaxSubdivision] = useState(DEFAULT_MAX_SUBDIVISION);

  const run = useCallback(async () => {
    const canvas = canvasRef.current;
    const source = fixtures.find((f) => f.name === fixture);
    if (!canvas || !source) return;
    setRunning(true);
    setResults([]);

    const { ViewerScene: Scene } = await import("@/viewer/scene");
    const loaded = loadFold(source.foldText);
    if (!loaded.ok) {
      setProgress(`could not load ${fixture}`);
      setRunning(false);
      return;
    }

    const collected: Result[] = [];
    let model: ResolvedModel = loaded.model;
    for (const subdivision of SUBDIVISIONS.filter((level) => level <= maxSubdivision)) {
      if (subdivision > 0) model = subdivide(model);
      for (const animator of ANIMATORS) {
        setProgress(`${fixture} ×${4 ** subdivision} · ${animator}`);
        const controller = new ViewerController(model, createAnimator(animator));
        const scene: ViewerScene = new Scene(canvas, model, controller);
        const intervals: number[] = [];
        for (let to = 1; to < model.frames.length; to++) {
          controller.goTo(to);
          await recordUntilSettled(controller, intervals);
        }
        scene.dispose();
        controller.dispose();
        collected.push({
          fixture,
          subdivision,
          vertices: model.vertexCount,
          animator,
          ...summarise(intervals),
        });
        setResults([...collected]);
      }
    }
    setProgress("done");
    setRunning(false);
  }, [fixture, fixtures, maxSubdivision]);

  return (
    <div className="flex flex-col gap-4" data-testid="bench">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={fixture}
          onChange={(event) => setFixture(event.target.value)}
          disabled={running}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          data-testid="bench-fixture"
        >
          {fixtures.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          up to
          <select
            value={maxSubdivision}
            onChange={(event) => setMaxSubdivision(Number(event.target.value))}
            disabled={running}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            data-testid="bench-max"
          >
            {SUBDIVISIONS.map((level) => (
              <option key={level} value={level}>
                ×{4 ** level}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          data-testid="bench-run"
        >
          {running ? "Running…" : "Run"}
        </button>
        <span className="text-sm text-neutral-500" data-testid="bench-progress">
          {progress}
        </span>
        {results.length > 0 && !running && (
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(JSON.stringify(results, null, 2))}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          >
            Copy JSON
          </button>
        )}
      </div>

      <canvas ref={canvasRef} className="h-64 w-full rounded-lg bg-neutral-100" />

      {results.length > 0 && (
        <table className="w-full text-sm" data-testid="bench-results">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="py-1">Subdivision</th>
              <th>Vertices</th>
              <th>Animator</th>
              <th>Frames</th>
              <th>Avg fps</th>
              <th>5th pct</th>
              <th>Min fps</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={`${result.subdivision}-${result.animator}`} className="border-t">
                <td className="py-1">×{4 ** result.subdivision}</td>
                <td>{result.vertices}</td>
                <td>{result.animator}</td>
                <td>{result.frames}</td>
                <td>{result.avgFps.toFixed(1)}</td>
                <td>{result.p5Fps.toFixed(1)}</td>
                <td>{result.minFps.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Watches frame timing alongside the scene's own loop until the transition finishes. */
function recordUntilSettled(controller: ViewerController, intervals: number[]): Promise<void> {
  return new Promise((resolve) => {
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      intervals.push(now - last);
      last = now;
      if (controller.getState().transitioning) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

function summarise(intervals: number[]): Pick<Result, "frames" | "avgFps" | "minFps" | "p5Fps"> {
  if (intervals.length === 0) return { frames: 0, avgFps: 0, minFps: 0, p5Fps: 0 };
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((sum, value) => sum + value, 0);
  const slowest = sorted.at(-1)!;
  const p95Interval = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  return {
    frames: intervals.length,
    avgFps: 1000 / (total / intervals.length),
    minFps: 1000 / slowest,
    p5Fps: 1000 / p95Interval,
  };
}
