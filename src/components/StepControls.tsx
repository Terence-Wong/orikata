"use client";

interface StepControlsProps {
  frameIndex: number;
  frameCount: number;
  onPrev: () => void;
  onNext: () => void;
}

export function StepControls({ frameIndex, frameCount, onPrev, onNext }: StepControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={frameIndex === 0}
        data-testid="prev-step"
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 enabled:hover:bg-neutral-100 disabled:opacity-40"
      >
        Previous
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={frameIndex === frameCount - 1}
        data-testid="next-step"
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 enabled:hover:bg-neutral-100 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
