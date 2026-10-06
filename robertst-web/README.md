# robertst-web

A personal site for Greek mythology writing, built around an interactive 3D
amphora, with a private CMS behind it.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · PostgreSQL ·
Prisma 7.

## Getting started

You need Node 20.19+ and a PostgreSQL 14+ database. `docker-compose.yml` has one
if you do not.

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then fill in AUTH_SECRET (the file says how)

npm run db:up               # start Postgres in Docker on port 5433
npm run db:migrate          # create the schema
npm run db:seed             # load the sample myths and create an admin

npm run dev                 # http://localhost:3000
```

The seed creates `admin@localhost` with the password `amphora-dev-password`.
Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before seeding to choose your own, or run
`npm run cms:user` at any time to add or re-password an account.

Sign in at [/admin](http://localhost:3000/admin).

### Using your own Postgres

Nothing depends on Docker. Point `DATABASE_URL` at any Postgres and skip
`npm run db:up`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Domain and integration tests |
| `npm run db:up` / `db:down` | Local Postgres container |
| `npm run db:migrate` | Create and apply a migration (development) |
| `npm run db:deploy` | Apply existing migrations (production) |
| `npm run db:seed` | Load the sample myths |
| `npm run db:reset` | Drop, re-migrate and re-seed |
| `npm run db:studio` | Prisma Studio |
| `npm run cms:user` | Create or re-password a CMS account |
| `npm run content:sync` | Write the active collection to `data/vase-panels.json` |
| `npm run amphora` | Rebuild and verify the 3D amphora textures |
| `npm run backdrop` | Rebuild the homepage frieze tile |
| `npm run sky` | Re-light the backdrop from `content/stage/night-temple.png` |

### Tests

Pure domain tests run anywhere. Integration tests need `TEST_DATABASE_URL`
pointing at a database they are allowed to empty, and **skip** rather than run
against your development data when it is unset:

```bash
docker exec robertst-web-db psql -U amphora -d postgres \
  -c "CREATE DATABASE amphora_test OWNER amphora;"

DIRECT_DATABASE_URL="postgresql://amphora:amphora@localhost:5433/amphora_test" \
  npx prisma migrate deploy

# add TEST_DATABASE_URL to .env, then
npm test
```

## The amphora needs a rebuild step

The vessel's painted figures are baked into a texture atlas by an offline Node
pipeline — they are not drawn at runtime. Changing which stories are painted in
the CMS therefore takes two steps:

```bash
npm run content:sync   # active collection -> data/vase-panels.json
npm run amphora        # repaint the textures, then verify them
```

and the regenerated files under `public/models/amphora/` are committed. The CMS
says so on the collections page. Everything else — publishing, editing,
unpublishing, reordering — takes effect immediately.

Figures live in `content/figures/<slug>.png`; see the README there.

## Documentation

- [`docs/cms.md`](docs/cms.md) — architecture, workflows, deployment
- [`docs/amphora-3d.md`](docs/amphora-3d.md) — the 3D vessel
- [`docs/amphora-asset-pipeline.md`](docs/amphora-asset-pipeline.md) — texture bake
- [`docs/homepage-backdrop.md`](docs/homepage-backdrop.md) — the frieze backdrop

## Deployment

Vercel, with any hosted Postgres. See
[Deployment](docs/cms.md#deployment) for the environment variables, the
migration step and the media-storage setup.
