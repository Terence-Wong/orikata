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

## Generated fixtures

Nine fixtures have too many coordinates to type out, so `scripts/build-fixtures.ts` writes them
(`pnpm fixtures`, or `pnpm fixtures crane` for one). Four come from the closed forms below; the
paper airplane, crane, road map, samurai helmet and masu box are written as folding sequences. The derivations are here and the same consistency
tests apply, so a mistake in a formula fails the suite rather than slipping through — which is how
the waterbomb's quadratic and the Miura's parameterisation were both caught while writing them.
Their crease assignments are measured from the first folded frame rather than asserted, because
guessing mountain from valley across a tessellation is exactly the sort of thing to get wrong.

### `valid/accordion-pleat.fold` — 4 frames

A strip of six equal panels, width 1/6, divided by creases across it that alternate valley and
mountain. Folding keeps each panel's width, so the profile is a zigzag whose panels make an angle
±a with the flat sheet, and the crease between two of them is folded by 2a. Frames are at 2a = 60°,
120° and 180°; the last folds the pleat flat onto itself, so the panels stack.

### `valid/waterbomb-base.fold` — 3 frames

The preliminary base's crease pattern with mountain and valley exchanged: diagonals mountain,
midlines valley, so the corners rise instead of falling. The same one-degree-of-freedom collapse
applies, mirrored in z. With corners at radius r_c and height h_c and midpoints at r_m and h_m:

- r_c² + h_c² = 2 and r_m² + h_m² = 1 (the creases from the centre keep their length)
- (r_c/√2 − r_m)² + (r_c/√2)² + (h_c − h_m)² = 1 (corner to midpoint)

Substituting the first two into the third gives r_c² + h_c² − 2·r_c·r_m/√2 − 2·h_c·h_m = 0, a
quadratic in h_m. It has two roots: the larger collapses every midpoint onto the axis, which is
rigid but degenerate, so the fold takes the smaller. When the corners meet on the axis (r_c = 0)
the equations reduce to h_m = h_c/2.

### `valid/miura-ori.fold` — 4 frames

A tessellation of 48 identical parallelograms, 63 vertices, with a single degree of freedom: every
crease in the sheet moves together. Flat, vertex (i, j) sits at (i·p + (j mod 2)·d, j·q) — straight
rows, columns zigzagging by d, with p = 0.16, d = 0.07, q = 0.13.

Folded, take

    P(i, j) = (i·S + (j mod 2)·D, j·L, (i mod 2)·H)

Every face is then a parallelogram, hence planar, and the edges give

- S² + H² = p² — the row edges keep their length
- D² + L² = d² + q² — the column edges keep theirs
- S·D = p·d — the angle between them is unchanged, so faces stay congruent

which leave one free parameter. S runs from p (flat) down to p·d/√(d² + q²), where L reaches zero
and the sheet is folded flat; H, D and L follow from the three equations. The frames are at 35%,
70% and 97% of that range.

### `valid/miura-map.fold` — 5 frames

The same construction with p = 0.1, d = 0.02, q = 0.13 over ten columns and eight rows, taken all
the way: the frames are at 30%, 70%, 95% and 100%, where L = 0 and every crease is folded flat, so
all eighty panels lie in one stack. It is there to test how deep a stack the viewer orders and
draws: 3160 overlapping pairs, past the layer search's limit, so the stack is ordered by the
creases' own constraints and the fallback.

### Folding sequences: `paper-airplane`, `crane`, `road-map`, `samurai-helmet` and `masu-box`

Neither model has a closed form, so `scripts/folding-sequence.ts` builds them the way a diagram
reads: each step names a line in the folded model and the layers that turn about it. The sheet is
kept as convex faces, each with the rigid motion that carries it from the crease pattern to where it
lies. A fold cuts the chosen layers along its line (a convex face cut by a line stays convex, so the
crease pattern builds itself) and rotates the pieces on one side. Where a later cut leaves a vertex
part-way along a neighbour's side, the neighbour gains that vertex too, so every side of every face
is an edge.

Two things are checked before a file is written, and the usual consistency tests run on the result:

- **No tearing.** Every vertex must land in the same place from every face that holds it, in every
  frame. This is what rejects a fold that real paper cannot make rigidly — the crane's "fold the top
  down" precrease was dropped as a step for exactly this reason (see below).
- **Mountain or valley.** A crease folded flat has no geometric sign (see the conventions above), so
  the sequence records how it got there. A crease with one side turning lies on the fold line;
  nudging that side 10⁻³ rad the way it turns gives a small fold angle whose sign is the letter. A
  crease whose two sides both turn, opposite ways, is the spine of a reverse fold and changes over.
  A collapse placed directly (the crane's first three frames and its petal folds) takes its letters
  from the partial angles it passes through, which is one reason those steps have a half-way
  frame. The Maekawa test (|M − V| = 2 at every flat-folded vertex) is the check on all of this.

A move that is not one fold about one line, like a squash or a petal fold, gets its in-between
frames from `scripts/rigid-in-between.ts` (a step's `inBetween`). Given the state before and after,
which faces move, and one crease that drives the motion, it walks from the start in small
increments, solving by Levenberg–Marquardt to 10⁻¹² for positions where every face is exactly rigid
and the driving crease has turned its share. Each solution starts from the last, so the path is the
one reached continuously from the start; it throws if no rigid state exists part-way or the path
does not arrive at the end given. On the crane's petal folds it reproduces the four-bar linkage
solved by hand to 10⁻¹². A crease the step leaves at the same angle at both ends is held at that
angle on the way, as paper does; without that, a flap that only rides along, like the masu box's
tip standing up with its end wall, hinges freely and the solve leaves it anywhere.

### `valid/road-map.fold` — 11 frames

A 1.6 × 1 sheet accordion-folded into eight panels of 0.2, one crease at a time and alternating
forwards and back, then the strip folded in half three times (at y = 0.5, 0.25 and 0.125). Each
fold carries everything folded before it, so every new crease runs through all the layers and the
folds nest: 64 faces in one stack at the end, 2016 overlapping pairs, ordered by the layer search.

### `valid/paper-airplane.fold` — 8 frames

The classic dart from a 1 × √2 sheet (A4), x ∈ [−½, ½], nose at y = √2. Crease down the middle and
unfold; fold the top corners to the centre (lines from the nose at 45°); fold the new edges to the
centre (lines from the nose at 22.5°, meeting the long edges at y = √2 − ½(1 + √2)); fold in half
behind; fold one wing forward and one behind along x = ±0.13, parallel to the keel. The last frame
opens both wings a quarter-turn, square to the body, so it is the only frame not folded flat.

### `valid/crane.fold` — 17 frames

The traditional crane from a square of half-width 1, as `preliminary-base`. Frames 1–3 are that
fixture's closed-form collapse (partial, corners meeting, flat), turned by (x, y, z) → (x, z, −y) so
the flat base lies in z = 0 with the sheet's centre at the top (0, 0) and the corners together at
the bottom (0, −√2). Coordinates below are in that upright frame.

- **Kite folds.** The front flap's lower edges fold to the centre line along lines from the bottom
  point bisecting its 45° angle, which meet the sides at K = (±(√2 − 1), −(√2 − 1)). In the crease
  pattern K is (2 − √2, 0) on the midline, and the lines are the bird base's 22.5° creases.
- **Unfold**, leaving the horizontal crease through the two K points on the front layers too. On
  paper you fold the top down and back to make it, but the front flaps are joined along the spine to
  the back ones above that line, so the top cannot turn over without the back layers — a rigid
  model tears (the builder caught this). Real paper bends there for a moment; here it is a crease.
- **Petal folds**, in three frames each: lifted half-way, lifted to 150°, then flat. The lower part of the front layer
  turns up about the hinge y = −(√2 − 1). Around each K point four hinges close a loop: the base,
  which stays put; the petal; the kite flap on the petal; and the layer behind the flap, hinged to
  the base along the same kite line. That loop is a spherical four-bar linkage, rigid with one
  degree of freedom: for a given turn of the petal, the flap and the layer behind must meet where
  two circles on the sphere round K cross. `petalLift` solves that, following the linkage from flat
  a degree at a time because the circles cross twice and only continuity picks the fold. Half-way
  (petal at 90°) the layer behind has turned 41.9° towards the viewer and the flap 41.9° the other
  way; flat, the known half-turns are used, since there the circles only touch. The letters of the
  flat frame come from the half-way frame's angles, which is how the layer behind ends up in front
  of its neighbour rather than tucked behind it: my first hand derivation had it the other way,
  which is also allowed by Maekawa's theorem, but is not where the paper goes. The back repeats
  it: the bird base.

  The half-way frame is not decoration. Placed straight from the unfolded base to the flat petal,
  every crease interpolates independently, the solver has no rigid path to follow, and it settled
  60% of the model's size away from the stored shape, which the landing blend then snapped into
  place. A rigid variant that kept the kite flaps folded had a path but left a crease the wrong way
  round, which the Maekawa test caught. The 150° frame is there for the same reason: between 90°
  and flat the layer behind the flap swings its last 138°, so fold angles interpolated straight
  across left the faces 12% of the model apart and paper passed through paper by 6%. With it the
  gaps are under 5% and the animator can follow the rigid path (see the plan, 4.3 step 6).

- **Neck and tail.** Each lower flap (the corners (1, 1) and (−1, −1)) is inside-reverse-folded
  along a line through (0, −(√2 − 1)) at 15° below horizontal, which stands it at 60°. The flap's
  front layers turn behind and its back layers forward, so its spine flips from valley to mountain.
- **Head.** The neck is reverse-folded again, 78% of the way up, along the bisector of the neck
  and a direction a quarter-turn below it.
- **Wings.** The petals fold down along y = 0, front forward and back behind, and the last frame
  lifts them a quarter-turn each, so they stand at ±z out of the body.

The legs are not narrowed before the reverse folds. That fold runs from the lower flap up under the
petal, so on a rigid sheet it has to take the petal's edge with it, which the paper model does not
do; leaving it out gives a crane with a broader neck and tail.

### `valid/samurai-helmet.fold` — 8 frames

The traditional kabuto from a square of side 2 standing on a corner, corners at (0, ±a) and
(±a, 0) with a = √2, coloured side down. Every step is a plain fold, most of them of the front
layers only.

- **Triangle.** The top corner comes down to the bottom along y = 0, a valley, so the top half is
  the front layer from here on.
- **Square.** The left and right corners come down to (0, −a) along y = ±x: two flaps, both layers
  each, in front of a square with corners (0, 0), (±a/2, −a/2) and (0, −a).
- **Points up.** The flaps' lower halves fold up about y = −a/2, their points to (0, 0).
- **Horns.** Only the layers just folded up turn out, about a line from (0, −a/2) at 22.5° from
  upright, so each point swings 45° out and lands at (±½, −(a − 1)/2), beyond the square's upper
  sides. The layers under them cannot come: they are joined to the square along its sides.
- **Brim.** The front layer of the bottom triangle folds up at y = −3a/4, its point to (0, −a/2),
  then again at y = −a/2. The band it makes narrows from a/2 to a/4 either side of the middle,
  exactly the width of the square at those heights, over the base of the horns.
- **Back.** The back layer's point folds up behind about y = −a/2.

### `valid/masu-box.fold` — 16 frames

The traditional masu from a square of side 2√2 standing on a corner, corners at (0, ±2) and
(±2, 0). Folding the corners to the centre leaves the square [−1, 1]², and the box is its middle
half: floor [−½, ½]², walls ½ high, all four walls two layers thick.

- **Blintz, then the creases.** The four corners fold to the centre along x = ±1 and y = ±1. The
  top and bottom edges fold to the centre and back, then the sides, creasing x = ±½ and y = ±½
  through every layer. Creased with the corner flaps down, the lines run on straight into them
  when they are unfolded: y = 1.5 across the top flap and x = ±½ at its sides, and likewise for
  the others. The top and bottom corners are unfolded, and the four corner squares [½, 1]² (and
  mirrors) are creased along their diagonals.
- **Sides.** Everything beyond x = ±½ stands up a quarter-turn: the side walls, with their corner
  flaps lining them and their tips on the floor, and the corner squares and the top and bottom
  flaps' ears standing with them.
- **Ends.** The end wall [−½, ½] × [½, 1] rises a quarter-turn about y = ½, its flap standing on
  up above it. Each corner square splits along its diagonal into A, hinged on the end wall at
  x = ½, and B, hinged on the side wall at y = ½, which fold flat against the inside of the end
  wall: A at (x, y) → (1 − x, ½, y − ½), B at (x, y) → (1 − y, ½, x − ½), meeting along the
  diagonal. The side's corner flap lies on B and goes with it. The ear beside the end's flap is
  joined to A along y = 1 and stays in line with it. Around the corner vertex (½, ½) the floor,
  side wall, B, A and end wall make a five-crease vertex; with the side wall standing, it moves
  with one degree of freedom, and `rigid-in-between.ts` finds the path (two in-between frames).
- **Flap over.** The flap turns over the top of the wall and down its inside, (x, y) →
  (x, ½, 1.5 − y), its point bending at y = 1.5 onto the floor at (x, 2 − y, 0), and its ears fold
  over the corner halves: (x, y) → (1 − x, ½, 1.5 − y). Over the wall the flap is a valley and the
  ears a mountain; a placed move has no nudge to read that from, so the step says it.

On the wall's inside the layers run end wall, A, B, the side's corner flap, ear, end flap, and at
the top edge the three folds there nest. On the floor, the four flap points lie on top of the
floor with nothing folded flat between them: what says so is the bend at each wall's foot, where
both layers of the wall turn the same corner (see the plan, section 9).

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
