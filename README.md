# Orikata

Upload a multi-frame [FOLD](https://github.com/edemaine/fold) file and get a shareable URL showing a
step-by-step 3D animation of the model being folded. No accounts: the URL is the only access control.

The approved technical plan and decision log live in [docs/PLAN.md](docs/PLAN.md). The comparison
behind the choice of animation approach is in
[reports/animation-comparison.md](reports/animation-comparison.md).

## Development

Requires Node 22+ and pnpm (the version is pinned in `package.json`).

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm test           # Vitest unit + integration tests
pnpm test:e2e       # Playwright (needs `pnpm exec playwright install chromium` once)
pnpm lint && pnpm typecheck && pnpm format:check
pnpm compare        # regenerate the animation comparison figures and metrics
```

`pnpm dev` uses a **local backend**: Postgres runs in this process (PGlite, under
`.orikata-local/`) and uploads are written to disk instead of Vercel Blob, so no Vercel credentials
are needed to work on the app. It is switched on by `ORIKATA_LOCAL_BACKEND=1`, which `pnpm dev` sets
for you, and is never enabled in a deployment. Delete `.orikata-local/` to start from an empty
database.

`/examples/:name` opens one of the bundled models in the viewer, and the home page lists them; those
are part of the product. `/bench`, which measures the animators' frame rate, exists only for
development and is off in a production build unless `ORIKATA_DEV_ROUTES=1` is set. Any viewer URL
accepts `?animator=solver|lerp|instant` to override the animator the model's size would choose.

A Husky pre-commit hook runs lint-staged, `tsc --noEmit` and the Vitest suite. Playwright runs in CI
(GitHub Actions) on every push against the local backend, and again on `main` against a real Neon
branch and Blob store.

## Deployment (Vercel)

Environment variables, all provisioned in the Vercel project:

| Variable                | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store; separate stores for production and preview |
| `DATABASE_URL`          | Pooled Neon connection used at request time                   |
| `DATABASE_URL_UNPOOLED` | Direct Neon connection used by migrations                     |
| `RATE_LIMIT_SALT`       | Salt for the hashed addresses in `upload_attempts`            |
| `CRON_SECRET`           | Authorises the daily `/api/cron/cleanup` run                  |

CI additionally needs `E2E_DATABASE_URL` and `E2E_BLOB_READ_WRITE_TOKEN` as GitHub secrets, for the
`e2e-live` workflow.

Two things to know before changing the deployment:

- **Database migrations run in the build command** (`pnpm vercel-build` runs `db:migrate` before
  `next build`). This is safe only because Neon preview branching is enabled through the
  Vercel–Neon integration, so every preview deployment gets its own database branch. Do not disable
  preview branching without moving the migration step somewhere that runs once per environment.
- **Blob URLs are public but unguessable.** Uploaded FOLD files are stored in Vercel Blob with a
  random suffix and served directly to the viewer. Anyone holding a blob URL can read that file,
  exactly as anyone holding a `/view/:slug` URL can. This is the accepted v1 access model.

Uploads are open to anyone, capped at 5 MB, 100 frames, 10 000 vertices and 20 000 faces, rate
limited to 20 per hour per address with a ceiling of 500 new models a day overall. Uploaded files
are kept indefinitely; there is no delete in v1.

## Licences

Orikata's own code is unlicensed until a licence is chosen. Third-party code and the ported solver
are covered in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
