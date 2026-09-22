<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Orikata working rules

- Read `docs/PLAN.md` first. It is the approved plan and decision log; do not re-open decided questions.
- TDD for every feature: write the test, watch it fail for the right reason, write the minimum code, refactor green.
- Layers: `src/fold` and `src/animation` are pure TypeScript with no React/Three/Next imports (they run in Vitest under Node). `src/viewer` owns the Three.js scene. `src/components` is React. `src/server` is server-only.
- Fixtures under `fixtures/` are hand-authored; every coordinate is derived in `fixtures/README.md` and checked by `tests/unit/fixtures.test.ts`.
- Tests: `tests/unit` and `tests/integration` (Vitest), `tests/e2e` (Playwright, CI only). The viewer exposes `data-*` state attributes for e2e assertions; never assert on canvas pixels.
- Commands: `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm format`.
