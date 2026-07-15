# Disc Golf Go — Deploy (TypeScript rebuild)

The `rebuild/ts` branch is a ground-up TypeScript rewrite of the **training-based
app** (post-pivot). One Express app serves the frontend (`web/`) **and** the API
(`/api`), on top of the **existing** Neon Postgres schema — no schema changes.

- Backend: `src/` (22 feature modules, layered repo → service → routes)
- Frontend: `web/` (vanilla HTML/CSS/JS, monochrome design system)
- Tests: `node --test` (123 green) · Type-check: `npm run ts:typecheck`

## Prerequisites (once)

```bash
npm install          # installs the TS toolchain + types
npm run ts:typecheck # tsc --noEmit — must be clean
npm run ts:build     # compiles src/ -> dist/
npm run ts:start     # node dist/server.js
```

## Render — Web Service (on branch `rebuild/ts`)

| Setting | Value |
|---|---|
| Branch | `rebuild/ts` |
| Build command | `npm install && npm run ts:build` |
| Start command | `npm run ts:start` |
| Health check path | `/health` |

### Environment variables

| Var | Notes |
|---|---|
| `DATABASE_URL` | same Neon database as the current app |
| `JWT_SECRET` | **required in production** (app fails fast if missing) |
| `APP_BASE_URL` | `https://discgolfgo.app` |
| `NODE_ENV` | `production` |
| `POLSIA_API_KEY` | email (password reset, admin blasts) + R2 image upload |
| `ADMIN_PASSWORD` | admin dashboard login |
| `ADMIN_JWT_SECRET` | optional; falls back to `JWT_SECRET` |

No migration step is needed — the app reuses the existing schema. (`npm run migrate`
is the legacy bootstrap and is **not** part of this build.)

## Verify after deploy

1. `GET /health` → `{"status":"healthy"}`
2. `GET /api/config` → `{"appBaseUrl":"https://discgolfgo.app","env":"production"}`
3. `GET /api/courses/count` → `{"total": <number>}` (confirms DB connectivity)
4. Open the deploy URL → land on `/`, log in, confirm `/home` loads training data.

Then point the `discgolfgo.app` domain at this service.

## Schema baseline (recommended)

The live schema currently exists **only in Neon** (no `migrations/` in VCS).
Capture a baseline into version control:

```bash
DATABASE_URL='<neon-url>' npm run schema:dump   # -> schema/baseline.sql
git add schema/baseline.sql && git commit -m "chore: capture live schema baseline"
```

Uses `pg_dump --schema-only` when available, otherwise a catalog introspection
fallback (pure node/pg).

## Rollback

The legacy app still lives on `main` (`server.js` / `routes/` / `public/`).
If the new deploy misbehaves, point Render back at `main` — nothing in this
branch changed the database.

## Notes / deferred

- Out of scope (pre-pivot GPS/PvP platform, intentionally not ported): rounds,
  battles, crews, crew-wars, layouts, distance-analytics.
- Admin is a focused port (login, stats, user mgmt, badges, notifications,
  email, onboarding analytics); course-content admin was left out.
- One legacy behavior preserved + flagged: training streak/category **bonus** XP
  is recorded in `xp_transactions` but not added to `players.xp` (see
  `src/modules/training/training.service.ts`).
