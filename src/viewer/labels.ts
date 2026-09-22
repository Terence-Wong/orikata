export interface FrameLabelInput {
  index: number;
  title: string | undefined;
  description: string | undefined;
}

export interface FrameLabel {
  title: string;
  description: string | undefined;
  /** Null for frame 0, which is the crease pattern rather than a step. */
  progress: { step: number; total: number } | null;
}

/**
 * Frame 0 is the crease pattern; frames 1..N−1 are steps 1..N−1. A frame's own `frame_title` wins
 * when it has one.
 */
export function frameLabel(frames: readonly FrameLabelInput[], index: number): FrameLabel {
  const frame = frames[index]!;
  if (index === 0) {
    return {
      title: frame.title ?? "Crease pattern",
      description: frame.description,
      progress: null,
    };
  }
  return {
    title: frame.title ?? `Step ${index}`,
    description: frame.description,
    progress: { step: index, total: frames.length - 1 },
  };
}
