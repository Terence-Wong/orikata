"use client";

interface StepControlsProps {
  currentStep: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function StepControls({ currentStep, totalSteps, onPrev, onNext }: StepControlsProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onPrev}
        disabled={currentStep === 0}
        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
      >
        Prev
      </button>
      <span className="text-sm text-white/70 min-w-[80px] text-center">
        Step {currentStep} of {totalSteps - 1}
      </span>
      <button
        onClick={onNext}
        disabled={currentStep === totalSteps - 1}
        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
      >
        Next
      </button>
    </div>
  );
}
