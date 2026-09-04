# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # dev server (Turbopack) on http://localhost:3000
npm run build      # production build
npm run lint       # eslint (flat config)
npm run typecheck  # tsc --noEmit
npm test           # node:test via tsx; see below

npm run db:up      # local Postgres (docker-compose.yml, port 5433)
npm run db:migrate # create + apply a migration
npm run db:seed    # sample myths + an admin account
npm run cms:user   # create or re-password a CMS account
```

Tests run under `node --test` with tsx. Pure domain tests run anywhere;
integration tests need `TEST_DATABASE_URL` (a database they may empty) and skip
without it. `--conditions=react-server` is what makes `import "server-only"`
resolve to a no-op outside Next.

## Architecture

Next.js 16 App Router site (React 19, TypeScript strict, Tailwind CSS v4) backed
by PostgreSQL via Prisma 7. Personal site for writings and interactive
experiences, themed on Greek mythology, with a private CMS at `/admin`.

**Content lives in Postgres, not in files.** `data/myths.ts` and
`content/myths/` are gone. `prisma/seed-data/` holds the original markdown as
seed fixtures only. Full architecture: `docs/cms.md`.

- `prisma/schema.prisma` — `Story` (the working draft), `StoryRevision`
  (append-only history), `Collection` / `CollectionEntry` (what the site
  presents), `MediaAsset`, `User`, `Session`.
- **The central invariant**: a `Story` row is the *draft*;
  `Story.publishedRevisionId` points at the immutable snapshot readers get. Public
  queries read the snapshot, never the row. Editing a live story changes nothing
  publicly until it is published again.
- **A second invariant**: the working draft always equals the newest revision,
  because every write path appends one. Restore therefore cannot lose saved work.
- `lib/cms/*` — all write logic and validation, no React. `lib/content/*` —
  public read models that filter on status in the query. `lib/auth/*` — scrypt
  hashing and database-backed sessions (no Auth.js; see docs/cms.md for why).
- `app/admin/actions.ts` — every mutation. Each one calls `requireUser()`
  independently; `tests/authorization.test.ts` enforces that.
- `app/myths/[slug]/page.tsx` — public story, or the working draft under an
  authenticated Draft Mode preview (`lib/preview.ts` requires *both* the
  draft-mode cookie and a live session).

In Next 16 `params` is a Promise — dynamic pages must be `async` and
`await params`. Prisma 7 keeps connection URLs in `prisma.config.ts`, not in the
schema, and connects through a driver adapter (`lib/db.ts`).

**The amphora needs a rebuild step.** Its painted figures are baked into a
texture atlas offline. The CMS owns *which* stories are painted
(`CollectionEntry.amphoraSlot`); repainting is
`npm run content:sync && npm run amphora`, and the textures are committed.
Figures are files at `content/figures/<slug>.png`.

Imports use the `@/*` path alias mapped to the repo root (e.g. `@/lib/cms/stories`, `@/components/Amphora`).

Styling: Tailwind v4 via `@import "tailwindcss"` in `app/globals.css`, with light/dark CSS custom properties (`--background` / `--foreground`) exposed to Tailwind through `@theme inline`. There is no `tailwind.config.js` — theme config lives in the CSS.
