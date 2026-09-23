# Fixtures

All files here are hand-authored. Every coordinate below is derived, not measured, and
`tests/unit/fixtures.test.ts` checks that each valid fixture is internally consistent (rigid faces,
planar faces, fold-angle signs matching assignments, expected newly-active edge sets). If a
derivation here is wrong the tests fail, which is the point: a silently wrong fixture would
invalidate the animation comparison.

Conventions used throughout:

- Frame 0 is the flat crease pattern with 2D coordinates (z = 0). Faces are listed counter-clockwise
  when viewed from +z, so every face normal starts as +z.
- Fold angle sign follows FOLD's `edges_foldAngle`: valley positive, mountain negative. A valley is a
  crease where the +z ("top") sides of the two faces come together.
- Flat-folded creases (±180°) have coincident vertices, exactly as real files do. The sign at 180° is
  geometrically undefined and is taken from `edges_assignment`.
- Irrational coordinates are written at full double precision.

## `valid/book-fold.fold` — 2 frames

Unit square with midpoints on the bottom and top edges.

| v   | coords   |
| --- | -------- |
| 0   | (0, 0)   |
| 1   | (0.5, 0) |
| 2   | (1, 0)   |
| 3   | (1, 1)   |
| 4   | (0.5, 1) |
| 5   | (0, 1)   |

Edges 0–5 are the boundary in order; edge 6 = (1, 4) is the crease. Faces: f0 = [0, 1, 4, 5] (left),
f1 = [1, 2, 3, 4] (right).

**Frame 1** (inherits frame 0): the right half is reflected across the line x = 0.5 onto the left
half, `x → 1 − x`, z stays 0. So v2 → (0, 0, 0) and v3 → (0, 1, 0). Edge 6 becomes `V`; its fold
angle is +180°. Frame 1 has a title and no description (used by the "description hidden when
absent" e2e scenario). Frame 0 has no title, so the viewer's "Crease pattern" fallback is exercised.

Expected newly-active edges: frame 1 → {6} (assignment U→V and angle 0°→180°).

## `valid/book-fold-90.fold` — 3 frames

Same crease pattern. **Frame 1**: the right half is rotated 90° about the crease towards +z:
`(1, y, 0) → (0.5, y, 0.5)`. **Frame 2**: fully flat as in book-fold.

Sign check of the dihedral formula on frame 1 (this is the test that pins the convention):

- f₁ = f0 traverses the crease as v1→v4, so a = v1, b = v4, û = (0, 1, 0).
- n₁ (f0) = (0, 0, 1). n₂ (f1) is the normal of the vertical face [v1, v2', v3', v4] = (−1, 0, 0).
- θ = atan2((n₂ × n₁)·û, n₁·n₂) = atan2(((−1,0,0)×(0,0,1))·(0,1,0), 0) = atan2(+1, 0) = **+90°**, a
  valley, matching the `V` assignment.

Expected newly-active edges: frame 1 → {6}, frame 2 → {6}.

## `valid/diagonal-twice.fold` — 3 frames

Unit square with both diagonals, meeting at the centre v4 = (0.5, 0.5).

| v   | coords     |
| --- | ---------- |
| 0   | (0, 0)     |
| 1   | (1, 0)     |
| 2   | (1, 1)     |
| 3   | (0, 1)     |
| 4   | (0.5, 0.5) |

Edges: 0–3 boundary; 4 = (0, 4) and 5 = (4, 2) are the two halves of the main diagonal; 6 = (1, 4)
and 7 = (3, 4) are the two halves of the anti-diagonal. Faces: f0 = [0, 1, 4] (bottom),
f1 = [1, 2, 4] (right), f2 = [2, 3, 4] (top), f3 = [3, 0, 4] (left).

**Frame 1** (inherits frame 0): fold along the main diagonal, reflecting the half containing v1
across the line y = x: v1 (1, 0) → (0, 1). Edges 4 and 5 become `V` (+180°). f0 and f1 now lie on
top of f3 and f2 with their normals flipped to −z.

**Frame 2** (inherits frame 1): fold along the anti-diagonal, reflecting v0 across the line
x + y = 1: v0 (0, 0) → (1, 1). Two creases move at once, one in each layer:

- Edge 7 = (3, 4) is between f2 and f3 in the bottom layer (normals +z). Its flap swings up towards
  +z and over, so top sides meet: **valley** (`V`, +180°).
- Edge 6 = (1, 4) is between f0 and f1 in the top layer (normals −z). The same physical motion brings
  the back sides of f0 and f1 together: **mountain** (`M`, −180°).

Expected newly-active edges: frame 1 → {4, 5}; frame 2 → {6, 7}. Edges 4 and 5 stay at 180° in
frame 2 and are not active there.

## `valid/preliminary-base.fold` — 4 frames

Square of half-width 1 centred on the origin, with both diagonals (valleys) and both midlines
(mountains) — the standard preliminary-base crease pattern. Nine vertices:

| v   | role           | coords                             |
| --- | -------------- | ---------------------------------- |
| 0   | centre         | (0, 0)                             |
| 1–4 | corners        | (1, 1), (−1, 1), (−1, −1), (1, −1) |
| 5–8 | edge midpoints | (1, 0), (0, 1), (−1, 0), (0, −1)   |

Edges 0–7 boundary (going round from v5), 8–11 diagonals (v0 to v1..v4, `V`), 12–15 midlines (v0 to
v5..v8, `M`). Eight triangular faces, one per 45° sector, counter-clockwise from +x.

Frame 0 already carries the M/V assignments (as a real crease pattern would), so activity in this
fixture comes from the angle rule only.

### The symmetric collapse (frames 1 and 2)

Under fourfold rotational symmetry the collapse has one degree of freedom. Put each corner at
radius r_c and height −h_c, and each midpoint at radius r_m and height −h_m, on their original
azimuths. Rigidity of the three edge types gives:

- centre–corner: r_c² + h_c² = 2
- centre–midpoint: r_m² + h_m² = 1
- corner–midpoint (e.g. (1,1)→(1,0)): (r_c/√2 − r_m)² + (r_c/√2)² + (h_c − h_m)² = 1

**Frame 1** (partial): choose h_c = 1 ⇒ r_c = 1. Substituting into the third equation and using the
second: √2·r_m + 2·h_m = 2, so r_m = √2(1 − h_m); then 2(1 − h_m)² + h_m² = 1 ⇒ 3h_m² − 4h_m + 1 = 0
⇒ h_m = 1/3 (the root h_m = 1 is the inverted configuration). Hence:

- corners at (±1/√2, ±1/√2, −1)
- midpoints at radius 2√2/3 ≈ 0.9428, height −1/3

Fold angles at this frame, by the dihedral formula: midlines exactly −90° (mountain), diagonals
+acos(7/9) ≈ +38.94° (valley). Both are asserted in the tests.

**Frame 2** (corners meet): r_c = 0, h_c = √2, all four corners at (0, 0, −√2). Then
r_m² + (√2 − h_m)² = 1 with r_m² + h_m² = 1 gives h_m = r_m = √2/2. The two triangles around each
midpoint are now the same triangle (apex, corner-point, midpoint), so every midline is already
folded flat: −180°. Adjacent arms are 90° apart, so every diagonal is at +90°.

### Flattening (frame 3)

With the corners coincident the four "arms" (double-layer triangles around v5..v8) hinge freely
about the vertical axis. Rotate the v6 arm to azimuth 0 (onto the v5 arm) and the v8 arm to azimuth
π (onto the v7 arm):

- v5, v6 → (√2/2, 0, −√2/2); v7, v8 → (−√2/2, 0, −√2/2); corners unchanged.

Resulting fold angles: midlines stay −180°; diagonals 8 (between arms v5 and v6) and 10 (between
arms v7 and v8) go to +180°; diagonals 9 (arms v6, v7) and 11 (arms v8, v5) open to **0°** — they
lie flat across the front and back of the diamond. That is the real preliminary base: the vertical
centre line on each face is a crease that has been folded and unfolded.

Expected newly-active edges: frame 1 → {8..15}; frame 2 → {8..15}; frame 3 → {8, 9, 10, 11}.

## `invalid/` — one file per validation rule

| file                           | rule                                              | expected code             |
| ------------------------------ | ------------------------------------------------- | ------------------------- |
| `invalid-json.fold`            | truncated JSON                                    | `INVALID_JSON`            |
| `one-frame.fold`               | no `file_frames`                                  | `TOO_FEW_FRAMES`          |
| `missing-vertices-coords.fold` | frame 1 has no `vertices_coords` of its own       | `MISSING_VERTICES_COORDS` |
| `missing-edges-vertices.fold`  | frame 1 does not inherit, lacks `edges_vertices`  | `MISSING_EDGES_VERTICES`  |
| `missing-faces-vertices.fold`  | frame 1 does not inherit, lacks `faces_vertices`  | `MISSING_FACES_VERTICES`  |
| `vertex-count-changes.fold`    | frame 1 has 7 vertices, frame 0 has 6             | `VERTEX_COUNT_MISMATCH`   |
| `topology-changes.fold`        | frame 1 lists the same edges in a different order | `TOPOLOGY_MISMATCH`       |
| `edge-lengths-change.fold`     | frame 1 stretches and collapses edges             | `EDGE_LENGTH_MISMATCH`    |
| `bad-frame-parent.fold`        | `frame_parent: 7`                                 | `BAD_FRAME_PARENT`        |
| `inherit-cycle.fold`           | frames 1 and 2 inherit from each other            | `INHERIT_CYCLE`           |
