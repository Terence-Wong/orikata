import { describe, expect, it } from "vitest";
import { loadFold } from "@/fold";
import { readFixture } from "../../helpers/fixtures";

describe("loadFold", () => {
  it("returns title, counts, topology and fully resolved frames for a valid file", () => {
    const result = loadFold(readFixture("valid", "book-fold"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { model } = result;
    expect(model.title).toBe("Book fold");
    expect(model.vertexCount).toBe(6);
    expect(model.edgesVertices).toHaveLength(7);
    expect(model.facesVertices).toHaveLength(2);
    expect(model.frames).toHaveLength(2);
    expect(model.warnings).toEqual([]);
  });

  it("uses undefined for a missing file_title", () => {
    const text = readFixture("valid", "book-fold").replace('"file_title": "Book fold",', "");
    const result = loadFold(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model.title).toBeUndefined();
  });

  it("warns (but does not fail) when edges_foldAngle disagrees with the geometry by more than 1°", () => {
    // The hint goes on the last frame: edges_foldAngle is geometry and would be inherited by
    // later frames, producing a warning for each of them.
    const text = readFixture("valid", "book-fold-90").replace(
      '"frame_title": "Fold flat",',
      '"frame_title": "Fold flat", "edges_foldAngle": [0, 0, 0, 0, 0, 0, 175],',
    );
    const result = loadFold(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.warnings).toHaveLength(1);
    expect(result.model.warnings[0]).toMatch(/frame 2.*edge 6.*175.*180/);
  });

  it("does not warn when edges_foldAngle agrees within 1°", () => {
    const text = readFixture("valid", "book-fold-90").replace(
      '"frame_title": "Fold flat",',
      '"frame_title": "Fold flat", "edges_foldAngle": [0, 0, 0, 0, 0, 0, 179.5],',
    );
    const result = loadFold(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model.warnings).toEqual([]);
  });

  it("rejects malformed file_frames entries as frames without coordinates", () => {
    const result = loadFold(
      '{"vertices_coords": [[0,0]], "edges_vertices": [], "faces_vertices": [], "file_frames": [42]}',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.code).toBe("MISSING_VERTICES_COORDS");
  });

  it.each([
    ["frames", { maxFrames: 2 }, "TOO_MANY_FRAMES"],
    ["vertices", { maxVertices: 5 }, "TOO_MANY_VERTICES"],
    ["faces", { maxFaces: 1 }, "TOO_MANY_FACES"],
  ])("enforces an optional cap on %s", (_label, limits, code) => {
    const result = loadFold(readFixture("valid", "book-fold-90"), { limits });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.code)).toEqual([code]);
  });
});
