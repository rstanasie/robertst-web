# Seed fixtures

These files are **not** the content source — Postgres is. They are the myths the
site shipped with before the CMS existed, kept so that a fresh clone has
something to read and so `npm run db:seed` can rebuild a working database.

`prisma/seed.ts` upserts them by slug: re-running is safe, and it will never
touch a story whose slug is not in this directory.

Illustrations are not here. `content/figures/<slug>.png` is the amphora's
painted figure for a story, and it stays on disk because it is an input to the
texture bake in `scripts/amphora/`, not editorial content.
