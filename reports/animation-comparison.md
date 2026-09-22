# Animation prototypes: comparison and recommendation

**Checkpoint for Terence — 22 September 2026.** Both prototypes are built behind the shared
`FoldAnimator` interface and run on every transition of every fixture. Numbers come from
[`animation-metrics.md`](animation-metrics.md), regenerated with `pnpm compare`; figures are in
[`figures/`](figures/). Nothing has been built on top of either option.

**Recommendation: Option B (fold-angle tween driving the solver), with Option A kept as a
fallback for models the solver cannot animate fast enough.** The reasoning is below; the one real
cost is performance on large models, and it is bounded and measurable.

---

## 1. Option B's stability on preliminary-base 2→3

This is the transition you asked me to lead with: the star collapses to the flat diamond, four
diagonals move at once, two of them to ±180° and two back to 0°, from a start state where four
vertices are coincident and every midline is already folded flat.

| Measure                                                    | Value                                |
| ---------------------------------------------------------- | ------------------------------------ |
| Residual when the tween ends (worst crease vs. its target) | **0.13°**                            |
| Residual when the solver hands over to the stored geometry | **0.09°**                            |
| Frames spent settling before the handover                  | **1** (of a 24-frame budget)         |
| Distance any vertex moves during the landing blend         | **0.0017 units, 0.12% of the model** |
| Worst edge strain at any point in the transition           | **0.34%**                            |
| Worst face-angle change at any point                       | **0.53°**                            |

**Residual:** the solver tracks the tweened targets so closely that it is within 0.13° when the
tween finishes, and one settle frame closes it to 0.09°. It never uses the 400 ms settle budget.

**Visible snap:** there is none. The largest per-frame vertex movement during the whole transition
is 0.055 units and occurs in the middle of the fold, where the easing puts it; every landing frame
moves less than 0.001. A test pins this: motion never more than 1.6× the previous frame, and the
peak falls in the middle 60% of the transition rather than at the handover.

**Buckling into a different mode:** none observed. Every crease stays within 0.13° of its
instantaneous target for the whole transition, so the solver never finds an alternative
configuration; faces stay rigid to within 0.53° and 0.34%. The contact sheet
([`figures/preliminary-base-2-3.svg`](figures/preliminary-base-2-3.svg)) shows the pyramid opening
out through intermediate states and arriving flat, which is the motion the fixture describes.

Two things had to be fixed before this was true, and both are in the repository with tests:

- A fold angle wraps at ±180°. A crease pushed a degree past a flat fold read as −179° against a
  +180° target, saw a 359° error, and was flung apart. Each crease's angle is now followed
  continuously from where it started.
- At a flat fold the measured angle is +180° or −180° by rounding alone. Frame 2 starts with every
  midline already flat, so a mountain could begin its transition with a full turn of error. Seeding
  the solver now resolves each crease to the turn nearest its target.

**Accepted limitation, unchanged:** there is no collision detection. At the 50% sample of this
transition the arms swing through each other. A layered model will clip through itself under either
option.

---

## 2. Face distortion

Measured against the flat sheet in frame 0, every rendered frame at a fixed 60 fps, over the whole
transition including the landing. Full table in [`animation-metrics.md`](animation-metrics.md).

| Fixture · step       | A · max edge strain | B · max edge strain | A · max angle strain | B · max angle strain |
| -------------------- | ------------------- | ------------------- | -------------------- | -------------------- |
| book-fold 0→1        | **100.00%**         | 0.26%               | **90.00°**           | 1.07°                |
| book-fold-90 0→1     | 29.29%              | 0.12%               | 0.00°                | 0.17°                |
| book-fold-90 1→2     | 29.29%              | 0.12%               | 0.00°                | 0.48°                |
| diagonal-twice 0→1   | **100.00%**         | 0.64%               | **90.00°**           | 0.97°                |
| diagonal-twice 1→2   | **100.00%**         | 0.54%               | **90.00°**           | 0.47°                |
| preliminary-base 0→1 | 7.61%               | 1.02%               | 3.83°                | 1.64°                |
| preliminary-base 1→2 | 9.50%               | 0.88%               | 3.24°                | 1.34°                |
| preliminary-base 2→3 | 13.40%              | 0.34%               | 19.47°               | 0.53°                |

Option A's worst cases are not marginal: 100% edge strain means an edge collapses to zero length
half way through. That happens whenever a flap folds through 180°, because the straight line between
a vertex and its mirror image passes through the crease itself. The 90° angle strain on the same
transitions means faces fold flat against themselves rather than rotating. Both options land exactly
on the author's geometry, so the distortion is entirely in the middle of the motion, which is the
part the viewer exists to show.

Option B stays under 1.1% edge strain and 1.7° of face-angle change everywhere. The mean figures are
an order of magnitude smaller again (0.02–0.21%).

---

## 3. Visual quality

Contact sheets in [`figures/`](figures/), one per transition, sampled at 0/25/50/75/100% of the
transition. Both rows use the same fixed view and the same timestep, so they are directly
comparable. They are drawn from the geometry rather than screenshotted, so they regenerate
identically.

- [`book-fold-0-1.svg`](figures/book-fold-0-1.svg) is the clearest: under A the right half never
  leaves the plane, it simply shrinks towards the crease and then reappears folded. Under B it
  lifts, stands upright at the halfway point showing the back of the paper, and comes down.
- [`diagonal-twice-1-2.svg`](figures/diagonal-twice-1-2.svg) shows the same failure with two layers
  moving at once.
- [`preliminary-base-2-3.svg`](figures/preliminary-base-2-3.svg) shows A collapsing to the flat
  result by the halfway sample, having passed straight through the intermediate shape, while B is
  still opening out.

The viewer serves both on the same URL: `/view/:slug?animator=lerp` or `?animator=solver`, and
`/dev/:fixture?animator=…` for the fixtures. The choice is visible on the page as
`data-animator`.

---

## 4. Performance

Two measurements. The first is the solver's own cost, in Node, with no rendering: this is the honest
scaling curve. The second is rendered frame rate in a browser.

### Solver cost per rendered frame (this machine, Node)

| Subdivision | Vertices | Axial springs | Hinges | A · lerp | B · solver |
| ----------- | -------- | ------------- | ------ | -------- | ---------- |
| ×1          | 9        | 16            | 8      | 0.00 ms  | 0.10 ms    |
| ×4          | 25       | 56            | 40     | 0.00 ms  | 0.41 ms    |
| ×16         | 81       | 208           | 176    | 0.00 ms  | 1.59 ms    |
| ×64         | 289      | 800           | 736    | 0.00 ms  | 6.53 ms    |
| ×256        | 1089     | 3136          | 3008   | 0.00 ms  | 25.81 ms   |
| ×1024       | 4225     | 12416         | 12160  | 0.01 ms  | 104.81 ms  |

The cost is linear in element count, as expected: each level quadruples the elements and the time.
A 16.7 ms budget (60 fps) is exhausted at roughly **450 vertices** on this machine; a 33 ms budget
(30 fps) at roughly **900**. Option A's cost never leaves the noise floor.

### Rendered frame rate, average fps during transitions

Headless Chromium with SwiftShader — a software rasteriser, so these understate what real GPU
rendering would give and the comparison between the two rows is the meaningful part. **The throttled
rows are proxies, not measurements of real hardware**: Chrome CPU throttling at 4× stands in for a
mid-range laptop, and 6× with mobile device emulation stands in for a phone. No phone was measured.

| Vertices | unthrottled A / B | 4× (laptop proxy) A / B | 6× + mobile (phone proxy) A / B |
| -------- | ----------------- | ----------------------- | ------------------------------- |
| 9        | 57 / 57           | 56 / 57                 | 56 / 58                         |
| 25       | 57 / 58           | 58 / 59                 | 58 / 59                         |
| 81       | 58 / 58           | 58 / 58                 | 58 / 58                         |
| 289      | 58 / 58           | 58 / **10**             | 57 / **6**                      |
| 1089     | 58 / **10**       | 57 / **2.5**            | not run                         |
| 4225     | 58 / **2.5**      | 57 / **0.6**            | not run                         |

Option B holds 60 fps up to a few hundred vertices and then falls off a cliff. The cliff moves down
by roughly the throttling factor, as it should for a CPU-bound workload. Option A is flat
everywhere.

**Terence's own laptop numbers are still to come:** `/bench` is built and takes a fixture and a
subdivision level, so it can be run against the preview deployment once the Vercel project exists
(step 11), and it has a copy-to-clipboard JSON button.

### What a Worker or a GPU path would buy

- **Web Worker** (the fallback named in the plan): moves the solver off the main thread. It does not
  make the solver faster — the same ~105 ms of work at 4225 vertices still takes 105 ms — but the
  page stays responsive and rendering stays smooth while the model lags. It would turn "the tab
  freezes" into "the fold plays in slow motion", roughly a 2–3× useful increase in the model size
  that stays acceptable. Perhaps a day's work, mostly in the buffer handoff; the animator interface
  was designed so this is an implementation detail.
- **GPU path** (what the original Origami Simulator does): forces and integration as fragment
  shaders, with positions living in textures. The published work reports interactive rates on models
  far larger than anything here, so the 4225-vertex case would comfortably be real-time. The cost is
  high: it is a rewrite rather than a port, it cannot run in Vitest so the current test suite for the
  solver would not apply to it, and reading positions back for the distortion metric needs
  `readPixels`. I would not do this for v1.
- **Cheaper than either:** cap the substep budget per frame and let the solver lag behind the tween
  on large models, landing on the stored geometry regardless. Quality degrades gracefully instead of
  the frame rate collapsing. This is a few lines and worth doing whichever option you pick.

---

## 5. Complexity

|                    | A · lerp                          | B · solver                                                                                       |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Implementation     | 71 lines (`lerp.ts`, `easing.ts`) | 1091 lines across 6 files in `solver/`                                                           |
| Tests              | 15                                | 77                                                                                               |
| Dependencies added | none                              | none                                                                                             |
| Tuning constants   | 2 (duration, easing)              | 9 (stiffnesses, damping, timestep safety, substep budget, settle and landing windows, tolerance) |

Option A is trivially correct and will never need attention. Option B is the larger part of the
codebase and the part most likely to need care later: the constants interact, and two of the three
bugs found during this work were in geometry that only a particular fixture exercised. Against that,
the maths is covered by finite-difference tests that will catch a bad edit immediately, and the
mechanical model is a published one rather than something invented here.

Licence and provenance are settled: the model is Amanda Ghassaei's Origami Simulator, MIT, ported
rather than vendored, with attribution in `THIRD_PARTY_LICENSES.md` and on the solver itself.

---

## 6. Recommendation

**Take Option B.** The product is a viewer whose entire purpose is to show the motion between two
states; Option A gets the endpoints right and the motion wrong, visibly and unrecoverably, on the
most ordinary fold there is. A viewer where the paper shrinks instead of folding does not do the job
the brief describes.

The one genuine objection to B is performance, and it is bounded rather than open-ended: it is fine
to a few hundred vertices, its cost is linear and measurable, and the animator interface makes both
the Worker fallback and a per-frame substep cap straightforward to add later.

Concretely, I propose:

1. Default to `solver`.
2. Keep `lerp` registered and reachable via `?animator=lerp`. It costs 71 lines and is the honest
   answer for a model the solver cannot keep up with.
3. Add a per-frame substep cap so large models degrade in quality rather than in frame rate, and
   fall back to `lerp` automatically above a vertex threshold — I would set that at 800 vertices on
   the evidence above, subject to your laptop numbers.
4. Revisit a Worker only if real uploads turn out to be larger than the fixtures suggest.

If you would rather not carry the solver's complexity, Option A with the endpoints correct is a
defensible v1 and I can strip `solver/` in an afternoon — but the book fold will look wrong.

## Questions this raises for you

1. Do you want the automatic fallback in point 3, or should `solver` always be used and simply run
   slowly on big models?
2. 800 vertices is my proposed threshold from these measurements. Happy to set it after you run
   `/bench` on your laptop, which needs the Vercel preview (step 11).
3. Keeping `lerp` costs almost nothing and gives a comparison point. Any objection to it staying?
