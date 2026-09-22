"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { InstantAnimator } from "@/animation/instant";
import { loadFold, type FoldError, type ResolvedModel } from "@/fold";
import { ViewerController, type ViewerState } from "@/viewer/controller";
import { frameLabel } from "@/viewer/labels";
import type { ViewerScene } from "@/viewer/scene";
import { StepControls } from "./StepControls";
import { StepPanel } from "./StepPanel";

export interface ViewerProps {
  foldText: string;
  /** Shown above the step panel; the file's `file_title` when it has one. */
  title?: string;
}

export function Viewer({ foldText, title }: ViewerProps) {
  const loaded = useMemo(() => loadFold(foldText), [foldText]);
  if (!loaded.ok) return <ViewerError errors={loaded.errors} />;
  return <LoadedViewer model={loaded.model} title={title ?? loaded.model.title} />;
}

function LoadedViewer({ model, title }: { model: ResolvedModel; title: string | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [controller, setController] = useState<ViewerController | null>(null);
  const [scene, setScene] = useState<ViewerScene | null>(null);

  // The controller and the scene are created and destroyed together, inside the effect, so a
  // remount (React StrictMode does one in development) rebuilds both rather than reusing a
  // controller whose animator has already been disposed.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const created = new ViewerController(model, new InstantAnimator());
    setController(created);

    let sceneInstance: ViewerScene | undefined;
    let cancelled = false;
    // Three.js reaches for WebGL as it loads, so it is imported in the browser only.
    void import("@/viewer/scene").then(({ ViewerScene: Scene }) => {
      if (cancelled) return;
      sceneInstance = new Scene(canvas, model, created);
      setScene(sceneInstance);
    });

    return () => {
      cancelled = true;
      sceneInstance?.dispose();
      created.dispose();
      setScene(null);
      setController(null);
    };
  }, [model]);

  const idleState = useMemo<ViewerState>(
    () => ({
      frameIndex: 0,
      frameCount: model.frames.length,
      transitioning: false,
      activeEdges: [],
      creasePanelOpen: false,
    }),
    [model],
  );
  const subscribe = useCallback(
    (listener: () => void) => controller?.subscribe(listener) ?? (() => {}),
    [controller],
  );
  const getSnapshot = useCallback(
    () => controller?.getState() ?? idleState,
    [controller, idleState],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Crease colours follow the frame being shown: an edge can go from unassigned to a valley.
  useEffect(() => {
    scene?.updateCreaseColors();
  }, [scene, state.frameIndex]);

  useEffect(() => {
    if (!controller) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") controller.next();
      if (event.key === "ArrowLeft") controller.prev();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller]);

  const label = frameLabel(model.frames, state.frameIndex);

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      data-testid="viewer"
      data-loaded={scene ? "true" : "false"}
      data-frame-index={state.frameIndex}
      data-frame-count={state.frameCount}
      data-transitioning={state.transitioning ? "true" : "false"}
      data-active-edges={state.activeEdges.join(",")}
      data-crease-panel-open={state.creasePanelOpen ? "true" : "false"}
      data-animator="instant"
    >
      <canvas
        ref={canvasRef}
        className="min-h-0 w-full flex-1 touch-none rounded-lg bg-neutral-100"
        data-testid="viewer-canvas"
      />
      <div className="flex flex-wrap items-end justify-between gap-4 px-1 pt-4">
        <div className="min-w-0">
          {title && <p className="truncate text-sm text-neutral-500">{title}</p>}
          <StepPanel label={label} />
        </div>
        <StepControls
          frameIndex={state.frameIndex}
          frameCount={state.frameCount}
          onPrev={() => controller?.prev()}
          onNext={() => controller?.next()}
        />
      </div>
    </div>
  );
}

function ViewerError({ errors }: { errors: FoldError[] }) {
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 p-4"
      data-testid="viewer-error"
      data-error-code={errors[0]?.code}
    >
      <h2 className="text-sm font-semibold text-red-900">This file could not be opened</h2>
      <ul className="mt-2 space-y-1 text-sm text-red-800">
        {errors.map((error) => (
          <li key={`${error.code}-${error.frameIndex ?? "file"}`}>{error.message}</li>
        ))}
      </ul>
    </div>
  );
}
