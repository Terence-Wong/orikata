# Orikata

Upload a multi-frame [FOLD](https://github.com/edemaine/fold) file and get a shareable URL showing a
step-by-step 3D animation of the model being folded. No accounts: the URL is the only access control.

The approved technical plan and decision log live in [docs/PLAN.md](docs/PLAN.md).

## Development

Requires Node 22+ and pnpm (the version is pinned in `package.json`).

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm test           # Vitest unit + integration tests
pnpm test:e2e       # Playwright (needs `pnpm exec playwright install chromium` once)
pnpm lint && pnpm typecheck && pnpm format:check
```

A Husky pre-commit hook runs lint-staged, `tsc --noEmit` and the Vitest suite. Playwright runs in CI
(GitHub Actions) on every push, not in the hook.

## Deployment (Vercel)

_Filled in as the storage and database layers land._ Notes that already apply:

- **Database migrations run in the Vercel build command** (`db:migrate` before `next build`). This is
  safe only because Neon preview branching is enabled through the Vercel–Neon integration, so every
  preview deployment gets its own database branch. Do not disable preview branching without moving the
  migration step somewhere that runs once per environment.
- **Blob URLs are public but unguessable.** Uploaded FOLD files are stored in Vercel Blob with a random
  suffix and served directly to the viewer. Anyone holding a blob URL can read that file, exactly as
  anyone holding a `/view/:slug` URL can. This is the accepted v1 access model.

## Licences

Orikata's own code is unlicensed until a licence is chosen. Third-party code and the ported solver are
covered in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
