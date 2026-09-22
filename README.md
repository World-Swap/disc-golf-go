# Disc Golf Go

Mobile-first web app (and Capacitor Android/iOS wrapper) where disc golfers
track rounds, check in at real courses (GPS-gated), complete training and
career quests, battle other players, and earn XP, badges, and gold.

The backend is a TypeScript Express app in `src/` (one module per feature),
booted by `server.js`. The frontend is served from `web/`. See
[`CLAUDE.md`](./CLAUDE.md) for the full architecture and database map.

## Stack

- Node.js + TypeScript · Express
- PostgreSQL (Neon)
- Hosted on Render · custom domain `discgolfgo.app`
- Capacitor for the Android/iOS builds (`ANDROID_BUILD.md`, `IOS_BUILD.md`)
- Resend for outbound email

## Requirements

- Node.js 20+
- A PostgreSQL database (Neon recommended)

## Environment variables

See [`DEPLOY.md`](./DEPLOY.md) for the full list. Core:

- `DATABASE_URL` — PostgreSQL connection string (required)
- `JWT_SECRET` — required in production
- `APP_BASE_URL` — e.g. `https://discgolfgo.app`
- `RESEND_API_KEY` — outbound email (optional in dev; email is best-effort)

## Local development

```bash
npm install
DATABASE_URL="postgresql://..." JWT_SECRET="dev-secret" npm run dev
```

## Build & run (production)

```bash
npm run ts:build   # compile src/ -> dist/
npm start          # server.js boots dist/ (falls back to ts-node)
```

## Deployment

Deployed on Render (`render.yaml`); auto-deploys on push to `main`.
