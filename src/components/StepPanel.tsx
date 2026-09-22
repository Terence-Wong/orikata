import type { FrameLabel } from "@/viewer/labels";

export function StepPanel({ label }: { label: FrameLabel }) {
  return (
    <div className="flex flex-col gap-1">
      {label.progress && (
        <p
          className="text-xs font-medium tracking-wide text-neutral-500 uppercase"
          data-testid="step-progress"
        >
          Step {label.progress.step} of {label.progress.total}
        </p>
      )}
      <h2 className="text-lg font-semibold text-neutral-900" data-testid="step-title">
        {label.title}
      </h2>
      {label.description && (
        <p className="text-sm text-neutral-600" data-testid="step-description">
          {label.description}
        </p>
      )}
    </div>
  );
}
