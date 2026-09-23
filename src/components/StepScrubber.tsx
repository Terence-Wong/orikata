"use client";

interface StepScrubberProps {
  position: number;
  frameCount: number;
  disabled: boolean;
  onScrub: (position: number) => void;
}

/**
 * Drags the model through the whole sequence by hand: 1.5 is half way from step 1 to step 2. The
 * buttons animate between steps; this is for watching a fold closely, at your own pace.
 */
export function StepScrubber({ position, frameCount, disabled, onScrub }: StepScrubberProps) {
  const last = frameCount - 1;
  return (
    <label className="flex items-center gap-3">
      <span className="sr-only">Scrub through the fold</span>
      <input
        type="range"
        min={0}
        max={last}
        step={0.01}
        value={position}
        disabled={disabled}
        onChange={(event) => onScrub(Number(event.target.value))}
        aria-label="Scrub through the fold"
        aria-valuetext={scrubLabel(position, last)}
        data-testid="step-scrubber"
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-800 disabled:opacity-40"
      />
    </label>
  );
}

function scrubLabel(position: number, last: number): string {
  const step = Math.round(position);
  if (Math.abs(position - step) < 0.005) {
    return step === 0 ? "Crease pattern" : `Step ${step} of ${last}`;
  }
  const from = Math.floor(position);
  return `Between ${from === 0 ? "the crease pattern" : `step ${from}`} and step ${from + 1}`;
}
