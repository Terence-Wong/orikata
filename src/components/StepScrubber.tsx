"use client";

interface StepScrubberProps {
  /** How far through the current step, 0 to 1. */
  progress: number;
  frameIndex: number;
  disabled: boolean;
  onScrub: (progress: number) => void;
}

/**
 * Moves the model through the current step by hand. The buttons animate from one step to the next;
 * this is for taking a single fold slowly. Frame 0 has no step leading into it, so there is
 * nothing to scrub there.
 */
export function StepScrubber({ progress, frameIndex, disabled, onScrub }: StepScrubberProps) {
  const unavailable = frameIndex === 0;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={1}
        step={0.005}
        value={unavailable ? 1 : progress}
        disabled={disabled || unavailable}
        onChange={(event) => onScrub(Number(event.target.value))}
        aria-label={unavailable ? "Nothing to unfold yet" : `Move through step ${frameIndex}`}
        aria-valuetext={`${Math.round(progress * 100)}% through this step`}
        data-testid="step-scrubber"
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-800 disabled:cursor-default disabled:opacity-40"
      />
      <span
        className="w-10 shrink-0 text-right text-xs tabular-nums text-neutral-500"
        data-testid="step-scrubber-value"
      >
        {unavailable ? "—" : `${Math.round(progress * 100)}%`}
      </span>
    </div>
  );
}
