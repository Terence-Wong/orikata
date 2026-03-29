"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { useFoldModel } from "@/hooks/useFoldModel";
import { useAnimation } from "@/hooks/useAnimation";
import { diffFrames } from "@/lib/fold-parser";
import dynamic from "next/dynamic";
import StepControls from "@/components/StepControls";
import StepPanel from "@/components/StepPanel";
import CreasePatternPanel from "@/components/CreasePatternPanel";

// Dynamic import to avoid SSR issues with three.js
const Viewer3D = dynamic(() => import("@/components/Viewer3D"), { ssr: false });

export default function ViewerPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { frames, filename, loading, error } = useFoldModel(slug);
  const [currentStep, setCurrentStep] = useState(0);
  const [showCreasePattern, setShowCreasePattern] = useState(false);
  const prevStepRef = useRef(0);
  const { positions: animatedPositions, animating, transitionTo, cancel } = useAnimation();

  const currentFrame = frames[currentStep] ?? null;
  const baseFrame = frames[0] ?? null;

  const diff = useMemo(() => {
    if (!baseFrame || currentStep === 0) return null;
    const prevFrame = frames[currentStep - 1];
    if (!prevFrame || !currentFrame) return null;
    return diffFrames(prevFrame, currentFrame);
  }, [frames, currentStep, baseFrame, currentFrame]);

  const changeStep = useCallback(
    (newStep: number) => {
      const prev = prevStepRef.current;
      if (newStep === prev || !frames[prev] || !frames[newStep]) return;
      cancel();
      transitionTo(frames[prev], frames[newStep]);
      prevStepRef.current = newStep;
      setCurrentStep(newStep);
    },
    [frames, cancel, transitionTo]
  );

  const handlePrev = useCallback(() => {
    changeStep(Math.max(0, currentStep - 1));
  }, [currentStep, changeStep]);

  const handleNext = useCallback(() => {
    changeStep(Math.min(frames.length - 1, currentStep + 1));
  }, [currentStep, frames.length, changeStep]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-foreground/60">Loading model...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-2">{error}</p>
          <a href="/" className="text-sm text-foreground/60 hover:text-foreground underline">
            Upload a new file
          </a>
        </div>
      </main>
    );
  }

  if (!currentFrame) return null;

  return (
    <main className="flex-1 flex flex-col h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#16162a] border-b border-white/10">
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm font-semibold text-white/80 hover:text-white">
            Orikata
          </a>
          {filename && (
            <span className="text-xs text-white/40">{filename}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StepControls
            currentStep={currentStep}
            totalSteps={frames.length}
            onPrev={handlePrev}
            onNext={handleNext}
          />
          <button
            onClick={() => setShowCreasePattern((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showCreasePattern
                ? "bg-blue-600 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            CP
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 3D Viewer */}
        <div className="flex-1 relative">
          <Viewer3D frame={currentFrame} animatedPositions={animatedPositions} />
        </div>

        {/* Side panel */}
        {showCreasePattern && baseFrame && (
          <aside className="w-72 bg-[#16162a] border-l border-white/10 overflow-y-auto">
            <StepPanel frame={currentFrame} />
            <CreasePatternPanel baseFrame={baseFrame} diff={diff} />
          </aside>
        )}
      </div>

      {/* Bottom step info (always visible) */}
      {!showCreasePattern && (
        <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2">
          <StepPanel frame={currentFrame} />
        </div>
      )}
    </main>
  );
}
