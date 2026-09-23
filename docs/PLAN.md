# Orikata — Technical Plan (approved 2026-09-21)

This is the approved plan for v1, with Terence's decisions folded in. Section 11 is the decision
log; section 12 lists the environment variables and provisioning ownership.

## 0. Summary

One Next.js app on Vercel. A framework-free TypeScript core (`src/fold`, `src/animation`) does all
FOLD parsing, frame resolution, validation, geometry and animation, so it is fully testable in Vitest
under Node. React handles the UI panels; a plain Three.js scene (no react-three-fiber) owns the
canvas. Storage is Vercel Blob (client uploads) + Neon Postgres via Drizzle. Origami Simulator's
solver is **ported** (MIT) from its GLSL/GPU form to a CPU TypeScript module, because the TDD and
measurement requirements need a solver that runs headless in Node.

The build is one pass with a hard stop after both animation prototypes run on the fixtures
(section 7, step 7).

## 1. Tech stack

| Choice                                                   | Justification                                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, strict                                       | Geometry code with index arrays is where silent bugs live; types catch most of them.                                                          |
| Next.js 16 (App Router), Node runtime for route handlers | Vercel-native; upload page, viewer page and three route handlers in one deployable.                                                           |
| React (UI only)                                          | Step panel, buttons, crease-pattern SVG, upload form.                                                                                         |
| Three.js + `OrbitControls` (plain, no react-three-fiber) | The animator writes into a `Float32Array` every frame; an imperative render loop is simpler and faster than going through React's reconciler. |
| Tailwind CSS                                             | Small UI, fast to style; no component library.                                                                                                |
| ~~`fold` npm~~                                           | Dropped after step 3 (decision Q5): the core needed nothing from it, so it was never added.                                                   |
| Ported Origami Simulator solver (MIT)                    | Section 2. No physics-engine libraries; it is a constraint-based thin-shell deformation solver.                                               |
| `earcut` via `THREE.ShapeUtils.triangulateShape`         | Triangulate polygonal faces for rendering and the solver; no extra dependency.                                                                |
| `@vercel/blob`                                           | Client uploads with `handleUpload` token route; size/type enforced in the token.                                                              |
| Neon Postgres + Drizzle ORM + `@neondatabase/serverless` | Slug → blob mapping, metadata, rate-limit table. Drizzle is thin, typed, has migrations.                                                      |
| PGlite (dev/test)                                        | In-process Postgres for integration and hermetic e2e tests: same Drizzle schema and real SQL, no network, no secrets in CI.                   |
| Zod                                                      | Route input validation and a typed FOLD schema.                                                                                               |
| `nanoid` (`customAlphabet`)                              | CSPRNG-backed slugs.                                                                                                                          |
| Vitest / Playwright                                      | Unit + integration / e2e in CI (Chromium with SwiftShader for WebGL).                                                                         |
| ESLint (flat) + Prettier, Husky + lint-staged            | Pre-commit: lint-staged, `tsc --noEmit`, `vitest run`.                                                                                        |
| GitHub Actions                                           | `check` + hermetic `e2e` on every push; `e2e-live` on `main`.                                                                                 |
| pnpm, Node 22                                            | Fast installs, Vercel-supported.                                                                                                              |

## 2. Origami Simulator integration

**Licence (verified 2026-09-21):** MIT, "Copyright (c) 2018 Amanda Ghassaei". Text in
`THIRD_PARTY_LICENSES.md`.

**Decision: port, not vendor or fork.**

- The original solver is GPGPU: forces and integration are GLSL fragment shaders driven by the app's
  globals. It cannot run in Vitest/Node, cannot be TDD'd, and reading positions back for the
  distortion metric would mean `readPixels` every substep.
- There is no maintained npm distribution (the `origami-simulator` npm package is an unrelated 2017
  stub).
- Per-crease tweened targets are not what the original exposes (it exposes a global fold-percent
  multiplier on `edges_foldAngle`).

**What gets ported** (`src/animation/solver/`, ~500–700 lines TS, typed arrays, attribution header):

- Mechanical model, unchanged from the original / the 7OSME paper: per-vertex mass; axial springs on
  every triangulated edge (stiffness EA/L₀, EA=20) with damping (ratio ≈ 0.45); crease torsional
  springs on interior edges (k = k_fold·L₀, k_fold = 0.7 for M/V, 0.2 for facet creases) using the
  Bridson-style hinge force distribution across the four hinge vertices; face angle springs (k = 0.2)
  that stop triangles shearing; explicit integration with `dt` from the stiffest axial spring's
  natural frequency, N substeps per rendered frame.
- Differences: per-crease target angles (tweened) instead of a global fold-percent; model normalised
  to a unit bounding box internally; rigid drift removed each substep (recentre centroid + Kabsch
  align to the previous substep) so global pose is controlled by us.
- Not ported: GPU path, curved-crease preprocessing, cdt2d, VR, UI.

Fallback if CPU performance is unacceptable on large models: Web Worker (the animator interface makes
that an implementation detail). Not built unless the measurements demand it.

## 3. FOLD parsing, inheritance, dihedral angles, newly-active edges

### 3.1 Pipeline (pure, `src/fold/`)

`parse(text) → RawFold` → `splitFrames` → `resolveFrames` → `validate` → `normaliseTopology` →
`computeGeometry` → `ResolvedModel`. Server (validation) and client (validation before upload,
rendering after download) run the identical pipeline.

### 3.2 Frames and inheritance

- Frame 0 = top-level object minus `file_*` keys and `file_frames`. `file_frames[i]` = frame i+1.
  `frame_parent` uses this numbering.
- Memoised DFS with a `visiting` set. `frame_inherit === true` → resolve parent first, then overlay
  this frame's own keys (whole-key override). Missing/out-of-range/non-integer `frame_parent` →
  `BAD_FRAME_PARENT`; re-entering a `visiting` frame → `INHERIT_CYCLE` (error names the cycle).
- **Metadata keys `frame_title`, `frame_description`, `frame_author`, `frame_classes`,
  `frame_attributes` are not inherited** (decision Q1).
- Each resolved frame records `parentIndex` = `frame_parent` if present, else N−1 (decision Q2).
- Every frame is fully resolved at load; the viewer only sees `ResolvedFrame[]`.

### 3.3 Validation (rejects with `{code, message, frameIndex?}`)

| Rule                                                                        | Code                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------- |
| Invalid JSON / not an object                                                | `INVALID_JSON`                                          |
| < 2 frames                                                                  | `TOO_FEW_FRAMES`                                        |
| Frame missing `vertices_coords`                                             | `MISSING_VERTICES_COORDS`                               |
| Resolved frame missing `edges_vertices` / `faces_vertices`                  | `MISSING_EDGES_VERTICES` / `MISSING_FACES_VERTICES`     |
| Vertex count differs from frame 0                                           | `VERTEX_COUNT_MISMATCH`                                 |
| `edges_vertices` or `faces_vertices` not deep-equal to frame 0 (strict, Q3) | `TOPOLOGY_MISMATCH` — message names the frame and array |
| Bad `frame_parent` / cycle                                                  | `BAD_FRAME_PARENT` / `INHERIT_CYCLE`                    |

Extra structural rules: coordinates are arrays of 2 or 3 finite numbers (2D → z = 0, in any frame);
indices in range; every consecutive face vertex pair is an edge; no edge with > 2 faces; faces with
≥ 3 vertices; `edges_assignment` length matches edges (missing → all `U`). Server caps: ≤ 5 MB,
≤ 100 frames, ≤ 10 000 vertices, ≤ 20 000 faces.

If a file carries `edges_foldAngle`, angles are still computed from geometry; a console warning (not
user-facing) is logged when they disagree by more than 1° (decision Q13).

### 3.4 Topology normalisation (once, from frame 0)

- Build `edges_faces` / `faces_edges` from the file's own `edges_vertices` order so edge ids stay
  aligned with `edges_assignment`.
- Orient all faces CCW viewed from +z in frame 0 so face normals start as +z.
- Triangulate faces (fan for triangles/convex; earcut otherwise). Triangulation diagonals become
  facet creases (`F`, target 0) for the solver and are excluded from crease-line rendering and the
  distortion metric.

### 3.5 Dihedral (fold) angles

For an interior edge e = (a, b) with faces f₁, f₂, where f₁ traverses a→b in its CCW winding and f₂
traverses b→a: n₁, n₂ = unit face normals (Newell's method); û = (b − a)/|b − a|;

**θ = atan2((n₂ × n₁)·û, n₁·n₂)** in (−180°, 180°]. Positive = valley, negative = mountain (FOLD
`edges_foldAngle` convention). The orientation is pinned by the book-fold-90 test (assignment `V` ⇒
θ = +90°).

Flat-folded edges (|θ| ≈ 180°): the sign is geometrically undefined (coincident faces; only layer
order distinguishes M from V and v1 ignores `faceOrders`). Tie-break: |(n₂×n₁)·û| < 1e−6 and
n₁·n₂ < 0 → sign from `edges_assignment`. Boundary edges have no angle and are never active. The
solver uses the same formula on the two adjacent triangles of a crease each substep.

### 3.6 Newly-active edges (R6)

`active(N) = { e : assign_parent(e) ∈ {F,U} ∧ assign_N(e) ∈ {M,V} } ∪ { e : |θ_N(e) − θ_{N−1}(e)| > τ }`

- τ = 5° (`ACTIVE_ANGLE_THRESHOLD_DEG`). Rigid steps give exactly 0° change on stationary creases;
  simulator exports carry ~0.01° noise.
- The difference is **not** wrapped: the physical path from +179° to −179° goes through 0°.
- `active(0) = ∅` (decision Q4). Output is a sorted `number[]` of edge ids exposed on the DOM.

## 4. Animation: shared interface and comparison

### 4.1 Shared interface (`src/animation/types.ts`)

```ts
interface FoldAnimator {
  init(model: ResolvedModel, out: Float32Array): void; // xyz per vertex, shared with the mesh
  jumpTo(frame: number): void; // instant
  beginTransition(from: number, to: number): void;
  step(dtSeconds: number): TransitionState; // 'running' | 'landing' | 'idle'; writes into `out`
  readonly positions: Float32Array; // same buffer as `out`
  dispose(): void;
}
```

- `ViewerController` (imperative core) owns the rAF loop and is the only caller of `step`. React
  subscribes via `useSyncExternalStore`.
- Implementation chosen by `?animator=lerp|solver`; everything else is identical across options.
- Both synchronous in v1. Shared `easeInOutCubic`, 800 ms per step. A click during a transition
  completes it instantly and starts the next.

### 4.2 Option A — `LerpAnimator`

Per-frame `Float32Array`s; `step` writes `lerp(P_from, P_to, ease(t))`. Lands exactly by
construction. Expected failure: the book fold's moving half shrinks to a line at t = 0.5.

### 4.3 Option B — `SolverAnimator`

1. `init`: triangulate, hinge data per interior edge, rest lengths from frame 0, per-frame per-crease
   target angles from 3.5.
2. `beginTransition`: warm start from current positions, velocities zeroed; Kabsch rigid transform
   between stored frames interpolated as a global pose.
3. `step`: s = ease(t); targets `θ_from + s·(θ_to − θ_from)`; solver substeps within a budget (start
   50/frame); remove drift; apply pose; write positions.
4. At s = 1: solve until residual < 0.5° or 400 ms cap, then **landing blend** onto the stored
   frame over 150 ms, then snap exactly.
5. Facet creases target 0 with facet stiffness; boundary edges have no crease spring.

### 4.4 Comparison harness (checkpoint deliverable)

Both animators, every transition of every valid fixture → `reports/animation-comparison.md` +
screenshots + recommendation.

**The report leads with Option B's stability on preliminary-base 2→3**: residual at s = 1, visible
snap in the landing blend, and any buckling into a different mode. It states that Option B's
performance numbers reflect the CPU port, not the original GPU implementation, and includes a short
estimate of what a Worker or GPU path would buy if B loses on the subdivided models.

| Criterion       | How measured                                                                                                                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Face distortion | Vitest script in Node, fixed dt (1/60 s), 800 ms transition, sampled every step. Per original FOLD edge: `abs(L(t) − L₀) / L₀`; max and mean over (edges × samples) per transition, per option. Secondary: per-face interior-angle deviation.                                                                                      |
| Performance     | `/bench` page (dev-only) records rAF intervals and solver ms/frame; copy-to-clipboard JSON. Runs: Terence's laptop from the preview deploy; Chrome with 4×/6× CPU throttling and Chrome mobile device emulation as **labelled phone proxies** (no real phone, decision Q9); subdivided preliminary-base (×4, ×16) to show scaling. |
| Visual quality  | Playwright captures both options at t = 0, 0.25, 0.5, 0.75, 1 per transition with a fixed camera; contact sheet in the report; one WebM per transition; `?animator=` toggle on the same URL.                                                                                                                                       |
| Complexity      | `cloc` per implementation, dependency count, number of tuning constants, a candid maintenance note.                                                                                                                                                                                                                                |

**Checkpoint:** after this report, stop and wait for Terence's pick. Animator-independent work
(steps 8–11) continues meanwhile (decision Q10); nothing animator-specific is built on either option.

## 5. Upload, validation, storage, slug

### 5.1 Flow

1. Client: read file → size ≤ 5 MB → full section 3 pipeline → error(s) or proceed. Compute SHA-256.
2. Client → `POST /api/upload` (`handleUpload` token route). `clientPayload = { size, sha256,
frameCount, title }`. `onBeforeGenerateToken`: rate-limit check; pathname must match
   `^models/[a-z0-9-]{20,}\.fold$`; `allowedContentTypes: ['application/json']` (client passes
   `contentType` explicitly because browsers give `.fold` files an empty type);
   `maximumSizeInBytes: 5 MB`; `addRandomSuffix: true`.
3. Client → Blob directly (`upload()` from `@vercel/blob/client`).
4. Client → `POST /api/models { blobUrl }`. Server: `head(blobUrl)` with our token (proves the blob is
   in our store — blocks SSRF and foreign URLs); fetch it server-side; re-run the full pipeline +
   caps; on failure `del(blobUrl)` and return the error; on success insert the row and return
   `{ slug }`. Client redirects to `/view/:slug`.
5. `/view/:slug`: server component looks up the slug (`notFound()` → 404), renders the client
   `Viewer` with the blob URL; the client fetches the JSON from Blob. `GET /api/models/:slug` returns
   the same metadata as JSON.

We do not rely on Blob's `onUploadCompleted` webhook (doesn't fire against localhost, async).

### 5.2 Schema (Drizzle)

```
models:           id uuid pk, slug text unique, blob_url text, blob_pathname text,
                  title text, frame_count int, size_bytes int, sha256 text, created_at timestamptz
upload_attempts:  id bigserial, ip_hash text, kind text ('token'|'create'), created_at timestamptz
                  index (ip_hash, created_at)
```

`title` = `file_title` if present, else the filename without extension. Migrations under `drizzle/`;
the Vercel build command runs `db:migrate` (against `DATABASE_URL_UNPOOLED`) before `next build`.
This relies on Neon preview branching via the Vercel integration (README documents this).

### 5.3 Slugs

`nanoid` `customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 11)` — 31¹¹ ≈ 2⁵⁴ possibilities, from
`crypto.getRandomValues`. `UNIQUE` constraint; on unique violation regenerate and retry (max 3).

### 5.4 Abuse mitigation

- Hard caps: 5 MB; ≤ 100 frames, ≤ 10 000 vertices, ≤ 20 000 faces.
- Rate limits in Postgres: 20 token requests/hour/IP and 20 creations/hour/IP, sliding window over
  `upload_attempts`; IP from Vercel's `x-real-ip`, stored as `sha256(salt + ip)`; rows purged after
  24 h by a daily Vercel Cron.
- Global circuit breaker: > 500 creations in 24 h → 503 until the window clears.
- Orphan sweep: the daily cron deletes blobs older than 24 h with no `models` row.
- Residual risk: botnets/VPN rotation defeat per-IP limits; the global breaker bounds the damage.
  Vercel WAF is the manual escalation lever. Blob URLs are public-but-unguessable (accepted, Q7).
  Uploads are kept forever; no delete in v1 (Q8).

## 6. Repo structure

```
src/app/                         # Next.js App Router
  page.tsx                       # upload page
  view/[slug]/page.tsx           # viewer page (server lookup → client <Viewer>)
  dev/[fixture]/page.tsx         # dev-only: viewer on a local fixture, no backend
  bench/page.tsx                 # dev-only: performance harness
  api/upload/route.ts            # Blob client-upload token (handleUpload)
  api/models/route.ts            # POST: verify blob, validate, create slug
  api/models/[slug]/route.ts     # GET metadata / 404
  api/cron/cleanup/route.ts      # daily: purge attempts, delete orphan blobs
src/fold/        types parse frames validate topology geometry activity index
src/animation/   types easing lerp solver/{model,forces,integrate,animator} metrics
src/viewer/      controller scene creaseLines camera testState
src/components/  Viewer StepPanel StepControls CreasePatternPanel UploadForm
src/server/      db schema models slug rateLimit blob env
fixtures/        README.md (derivations)  valid/  invalid/
tests/           unit/  integration/  e2e/  helpers/
scripts/compare-animators.ts     # writes reports/animation-comparison.md
reports/                         # checkpoint output (committed)
drizzle/                         # migrations
```

## 7. Build order (TDD throughout; ★ = animation checkpoint)

| #   | Step                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scaffold: Next + TS strict + Tailwind, Vitest, Playwright, ESLint/Prettier, Husky, CI, licences, this document. CI green before any feature.                                                                |
| 2   | Hand-author fixtures + `fixtures/README.md`; fixture-consistency tests (red).                                                                                                                               |
| 3   | `src/fold`: parse → frames/inheritance/cycles → validation → topology → dihedral angles → newly-active edges. Drop `fold` npm if unused.                                                                    |
| 4   | Viewer shell on `/examples/:name` (originally `/dev/:fixture`, made public 2026-09-23): Three scene, front/back colours, M/V crease lines, orbit, auto-fit camera, step panel, prev/next (instant), labels. |
| 5   | `FoldAnimator` interface + `LerpAnimator`.                                                                                                                                                                  |
| 6   | Solver port (TDD on analytic cases) + `SolverAnimator` with landing blend.                                                                                                                                  |
| 7   | **★ Comparison harness → `reports/animation-comparison.md` + screenshots + recommendation. STOP for Terence's decision.**                                                                                   |
| 8   | Crease-pattern panel (SVG) with newly-active highlighting; toggle; test state. (May run during the checkpoint.)                                                                                             |
| 9   | Server: Drizzle schema + migrations, PGlite harness, slug generation, rate limiting, token route, create route, view route, cron.                                                                           |
| 10  | Upload page with client-side validation and Blob client upload; `/view/:slug` wired to the DB; share button.                                                                                                |
| 11  | Playwright e2e (5 scenarios) hermetic in CI + `e2e-live` on `main`; ask Terence for env vars/secrets at this point.                                                                                         |
| 12  | After the animator decision: set default, tune constants, final polish, mobile layout pass.                                                                                                                 |

## 8. Test plan

Layers: Vitest unit (`tests/unit`, Node), Vitest integration (`tests/integration`, route handlers
called directly with `Request` objects, Drizzle on PGlite, fake `BLOB_READ_WRITE_TOKEN` of valid
shape, `head`/`fetch`/`del` mocked), Playwright e2e (`tests/e2e`, CI only).

| Brief §          | Tests                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3 FOLD handling  | Frame 0 split; numbering; inheritance overlay; metadata not inherited; cycle detection; bad parent. One test per validation rule with the matching invalid fixture asserting code and that the message names the frame (and array for topology). 2D → z = 0. Structural rules.                                                                                                 |
| 4 Newly-active   | Dihedral on hand-built hinges (0°, ±90°, ±180° tie-break, boundary, quad via Newell); sign pinned by book-fold-90; `active(N)` per fixture equals a hand-listed set; threshold boundary; no wrap.                                                                                                                                                                              |
| 5 Animation      | Both animators: `jumpTo` exact, transitions end exactly on target, shared buffer identity, state machine. Solver: single-hinge convergence, no blow-up over 10 000 substeps, rest lengths within 1%, drift removal. `metrics.ts` on a synthetic stretched edge.                                                                                                                |
| 6 Fixtures       | Every valid fixture, every frame: edge lengths equal frame 0 within 1e−8 relative; per-face interior angles preserved; faces planar; for 1° < abs(θ) < 179° sign matches assignment; at ≈180° magnitude asserted; unassigned creases ≈ 0°; expected `active()` sets. Invalid fixtures fail with exactly their intended code.                                                   |
| 7 Infrastructure | Token route: size > cap, wrong type, bad pathname, 429, token otherwise. Create route: `head` miss, every invalid fixture (and blob deleted), caps, slug + metadata for valid fixtures. View route 200/404. Slug alphabet/length/uniqueness over 100k + collision retry. Rate-limiter windows. Cron purge.                                                                     |
| 8 TDD/hooks      | Husky pre-commit: lint-staged, `tsc --noEmit`, `vitest run`. CI: `check` + hermetic `e2e` (PGlite + local file store, `next build && next start`, SwiftShader) on every push; `e2e-live` on `main` with `E2E_BLOB_READ_WRITE_TOKEN` / `E2E_DATABASE_URL`.                                                                                                                      |
| E2E scenarios    | (1) upload `book-fold.fold` → `/view/[23456789a-z]{11}` → `data-frame-index="0"`, title. (2) next/prev → title/description update; missing description → element absent. (3) crease toggle → `data-crease-panel-open`; SVG `[data-active="true"]` ids equal the expected set. (4) upload `inherit-cycle.fold` → error, URL unchanged. (5) fresh context opens a slug → loaded. |

Test-visible state on the viewer root: `data-loaded`, `data-frame-index`, `data-frame-count`,
`data-transitioning`, `data-active-edges="3,7,12"`, `data-animator`, `data-crease-panel-open`;
`data-testid` on step title/description/progress; SVG edges carry `data-edge-id`,
`data-assignment`, `data-active`.

### 8.1 Fixture geometry (hand-derived; full working in `fixtures/README.md`)

- **book-fold** (2 frames): unit square with midpoints (0.5,0), (0.5,1); 6 vertices, 7 edges, 2 quad
  faces. Frame 1: right half reflected onto the left (x → 1−x, z = 0, exactly 180°, crease `V`).
- **book-fold-90** (3 frames): as above with a 90° frame in between ((1,y,0) → (0.5,y,0.5)).
- **diagonal-twice** (3 frames): square with both diagonals → centre vertex, 4 triangles, 8 edges.
  Frame 1 (inherit, parent 0): main diagonal `V`, (1,0) → (0,1). Frame 2 (inherit, parent 1):
  anti-diagonal halves, (0,0) → (1,1); top-layer half `V`, bottom-layer half `M`.
- **preliminary-base** (4 frames): square centred at origin, half-width 1; corners (±1,±1), edge
  midpoints (±1,0), (0,±1), centre; 9 vertices, 16 edges, 8 triangles. Diagonals `V`, midlines `M`.
  Symmetric 1-DOF collapse: corner at radius r_c, height −h_c with r_c² + h_c² = 2; midpoint at
  (r_m, −h_m) with r_m² + h_m² = 1 and corner–midpoint distance 1. Frame 1: h_c = 1 ⇒ r_c = 1,
  h_m = 1/3, r_m = 2√2/3. Frame 2 (corners meet): corners at (0,0,−√2), midpoints at radius √2/2,
  height −√2/2, every midline already at 180°. Frame 3 (flat diamond): arms at azimuths 0, 0, π, π —
  four diagonals move at once, two to ±180° and two back to 0°.
- Coordinates stored to 12 significant digits; tests use relative tolerance 1e−8.

## 9. UI labels and behaviour (decisions Q14 and accepted assumptions)

- Frame 0 is labelled "Crease pattern" (also its title fallback). Frames 1..N−1 show "Step i of
  N−1"; fallback title "Step {i}".
- `frame_description` is rendered only when present; no placeholder.
- Crease-pattern panel draws frame 0's x,y with all edges coloured by the current frame's assignment
  (M red, V blue, B dark grey, F/U light grey) and newly-active edges emphasised.
- Front and back of the paper are rendered in two colours. Keyboard ←/→ mirror prev/next.
- Transition duration is a fixed 800 ms.
- Edges with > 2 faces and faces with < 3 vertices are rejected; 2D coordinates in any frame are
  z = 0.
- Accepted v1 limitations: no collision detection (layers may clip), z-fighting on coincident
  flat-folded layers.

## 10. Risks and unknowns

1. Solver port effort and tuning (largest schedule item).
2. CPU solver performance on large models; Worker fallback available.
3. Pose drift / visible settle in Option B — quantified in the report.
4. Flat-folded states: z-fighting; dihedral sign undefined at ±180° (assignment tie-break).
5. Non-convex / non-planar / non-manifold faces in real-world files are rejected or ear-clipped.
6. Real-world FOLD variety (re-indexed vertices rejected by design).
7. Vercel Blob details to confirm at build time: CORS on public GETs (fallback: streaming proxy
   route), current `handleUpload` payload shape.
8. Headless WebGL in CI — SwiftShader; e2e asserts on DOM state with a shortened transition flag.
9. Abuse — bounded, not eliminated.
10. Neon cold starts on first view of the day.

## 11. Decision log (Terence, 2026-09-21)

| Q   | Decision                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Exclude `frame_*` metadata from inheritance.                                                                                                                                                    |
| Q2  | Parent for the activity rule: `frame_parent` if present, else N−1.                                                                                                                              |
| Q3  | Strict topology equality for v1; error messages name the frame and the differing array.                                                                                                         |
| Q4  | Empty newly-active set at frame 0.                                                                                                                                                              |
| Q5  | Drop `fold` npm if unused after step 3. Done: it was never needed.                                                                                                                              |
| Q6  | Hermetic e2e on every push; `e2e-live` on `main`.                                                                                                                                               |
| Q7  | Public-but-unguessable blob URLs accepted; documented in README.                                                                                                                                |
| Q8  | Keep uploads forever; no delete in v1.                                                                                                                                                          |
| Q9  | Terence runs `/bench` on his laptop from the preview deploy; no phone — throttled Chrome + device emulation, labelled as proxies.                                                               |
| Q10 | Continue steps 8–11 during the checkpoint; build nothing animator-specific.                                                                                                                     |
| Q11 | Terence provisions GitHub, Vercel, Blob, Neon himself. Repo: github.com/Terence-Wong/orikata (old history kept at `archive/old-main`).                                                          |
| Q12 | Add `book-fold-90`.                                                                                                                                                                             |
| Q13 | Compute fold angles from geometry; console-only warning when `edges_foldAngle` disagrees by > 1°.                                                                                               |
| Q14 | Frame 0 = "Crease pattern"; frames 1..N−1 = "Step i of N−1"; fallback title "Step {i}".                                                                                                         |
| —   | **Animation checkpoint decided 2026-09-22: Option B (solver) is the default. `lerp` stays registered, and may be surfaced as a user-facing toggle later. No automatic fallback was asked for.** |
| Q15 | Caps as proposed.                                                                                                                                                                               |
| —   | Migrations run in the Vercel build command; depends on Neon preview branching (README).                                                                                                         |
| —   | Comparison report leads with Option B stability on preliminary-base 2→3; CPU-port perf labelled; Worker/GPU estimate included.                                                                  |

## 12. Environment variables (provisioned by Terence)

| Variable                                        | Where                            | Purpose                                           |
| ----------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| `BLOB_READ_WRITE_TOKEN`                         | Vercel (separate prod / preview) | Vercel Blob store token                           |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED`         | Vercel (Neon integration)        | Pooled runtime connection / direct for migrations |
| `RATE_LIMIT_SALT`                               | Vercel                           | Salt for hashed IPs in `upload_attempts`          |
| `CRON_SECRET`                                   | Vercel                           | Authorises the daily cleanup cron                 |
| `E2E_BLOB_READ_WRITE_TOKEN`, `E2E_DATABASE_URL` | GitHub Actions secrets           | `e2e-live` workflow on `main`                     |

Ask Terence for these when step 11 starts. Do not create Vercel, Blob or Neon resources.
