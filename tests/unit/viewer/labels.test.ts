import { describe, expect, it } from "vitest";
import { frameLabel } from "@/viewer/labels";

const frames = (titles: (string | undefined)[]) =>
  titles.map((title, index) => ({ index, title, description: undefined }));

describe("frameLabel", () => {
  it("labels frame 0 'Crease pattern' and gives it no step number", () => {
    const label = frameLabel(frames([undefined, "Fold"]), 0);
    expect(label.title).toBe("Crease pattern");
    expect(label.progress).toBeNull();
  });

  it("uses frame 0's own title when it has one", () => {
    expect(frameLabel(frames(["Square", "Fold"]), 0).title).toBe("Square");
  });

  it("numbers the folded frames from 1 and counts all frames but the crease pattern", () => {
    const list = frames([undefined, "One", "Two", "Three"]);
    expect(frameLabel(list, 1).progress).toEqual({ step: 1, total: 3 });
    expect(frameLabel(list, 3).progress).toEqual({ step: 3, total: 3 });
    expect(frameLabel(list, 2).title).toBe("Two");
  });

  it("falls back to 'Step i' for a folded frame with no title", () => {
    expect(frameLabel(frames([undefined, undefined, undefined]), 2).title).toBe("Step 2");
  });

  it("passes the description through only when the frame has one", () => {
    const list = [
      { index: 0, title: undefined, description: undefined },
      { index: 1, title: "Fold", description: "Bring the edge over." },
    ];
    expect(frameLabel(list, 0).description).toBeUndefined();
    expect(frameLabel(list, 1).description).toBe("Bring the edge over.");
  });
});
