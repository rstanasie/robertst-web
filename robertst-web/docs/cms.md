# The CMS

Writing, revising, previewing and publishing, without editing source.

Before this existed, content was files: `content/myths/<slug>/vN.md` for story
versions and `content/weeks/<iso>.json` for the weekly collection, read through
`lib/content/*` at request time. Publishing was `git push`. That is now
Postgres, and this document is how it fits together.

---

## Architecture

```
 /admin  (session-guarded)                  /myths/[slug]  (public)
    │                                              │
    ├── story editor ──┐                           │
    ├── revisions      │                           │
    ├── collections    │                           │
    └── media          │                           │
                       ▼                           ▼
              app/admin/actions.ts        lib/content/published.ts
              (server actions,            lib/content/collection.ts
               every one re-checks         (published rows only)
               the session)                        │
                       │                           │
                       ▼                           ▼
              lib/cms/*  ── domain logic, validation, revisions
                       │
                       ▼
                    lib/db.ts  ── Prisma 7 + pg driver adapter
                       │
                       ▼
                   PostgreSQL
```

Nothing new runs outside Next.js. There is no second backend, and the only
Node-side process is the offline amphora texture bake, which was already there.

### Layers, and what each is allowed to do

| Layer | Files | Rule |
| --- | --- | --- |
| Database | `prisma/schema.prisma`, `lib/db.ts` | The only place a connection string is read |
| Domain | `lib/cms/*` | All write logic and validation. Knows nothing about React |
| Public read | `lib/content/published.ts`, `lib/content/collection.ts` | Filters on status in the query, not in the caller |
| Access | `lib/access/*` | Pure. Decides how much of a story a viewer gets |
| Authorization | `lib/auth/*` | Sessions, hashing, guards |
| Actions | `app/admin/actions.ts` | Thin. Authorize, parse, delegate, revalidate |
| UI | `app/admin/**`, `components/cms/*` | No database access, no business rules |

A test (`tests/authorization.test.ts`) asserts that every exported server action
calls `requireUser()`, so a new mutation cannot be added without one.

---

## Database schema

Six models. The names are deliberately generic — `Story`, not `Myth` — so the
content system outlives the mythology project; the public experience stays
myth-specific on top of it.

### `Story` — the working draft

Holds the *current draft*: title, slug, subtitle, excerpt, markdown content,
`previewUntil`, SEO fields, featured and social images, status, timestamps and
`createdBy` / `updatedBy`.

Two counters and a pointer carry the workflow:

- **`publishedRevisionId`** — the immutable snapshot readers get. Null whenever
  the story is not live. **This is the central design decision**: the public
  page renders the snapshot, never the row, so editing a live story changes
  nothing publicly until it is published again.
- **`lockVersion`** — bumped on every write. The editor sends back the value it
  loaded, and a mismatch is refused. This is the optimistic lock.
- **`publishedVersion`** — the public telling number ("version 2"), incremented
  once per publish.

Status is an enum (`DRAFT` / `PUBLISHED` / `ARCHIVED`) rather than a boolean,
with a transition table in `lib/cms/validation.ts`. Archiving is a shelf: an
archived story must return to draft before it can go live again, so nothing
springs back onto the site by a misclick.

### `StoryRevision` — the history

An append-only snapshot of every content-bearing field, numbered per story, with
an author, a timestamp, and a `kind` (`CREATED`, `DRAFT_SAVE`, `PUBLISH`,
`UNPUBLISH`, `RESTORE`). Nothing ever updates or deletes one.

One invariant holds the design together: **the working draft always equals the
newest revision**, because every write path appends one. That is what makes
restore safe to offer without a "you will lose your draft" caveat — the current
draft is already in the history, one row above whatever is being restored.

### `Collection` and `CollectionEntry` — what the site presents

A collection is a named, ordered set of stories; exactly one is active, enforced
in `activateCollection`. An entry carries `position`, `access`
(`PREVIEW` / `LOCKED`) and `amphoraSlot`.

Nothing here knows about weeks or about "five myths". The amphora has five
painted panels because the 3D model has five (`VASE_SLOT_ANGLES` in
`lib/content/vase.ts`) — a collection may hold any number of stories, and only
the ones given a slot are painted.

### `MediaAsset` — pointers, not bytes

URL, provider, storage key, alt text, dimensions, MIME type, size. No binary
column. Deleting an asset nulls it out of stories and revisions rather than
cascading, because history must survive housekeeping.

### `User` and `Session`

Email, name, scrypt hash, role. Sessions are rows, not self-contained tokens —
see [Authentication](#authentication).

---

## Content representation

**Markdown, stored as text.** Not HTML, not a rich-text JSON document.

- **Versioning** is the deciding argument. Markdown diffs line by line, so the
  revision comparison is readable. A rich-text AST diffs as a tree, which needs
  a much larger diff implementation to say anything useful.
- **Security**: rendering goes through `react-markdown`, which builds React
  elements and never calls `dangerouslySetInnerHTML`. `rehype-raw` is
  deliberately *not* installed, so raw HTML in story text is inert **by
  construction** — there is no sanitiser to misconfigure. Link and image URLs
  are filtered by react-markdown's default transform, which drops `javascript:`.
- **Future**: MDX is a superset, so upgrading later does not migrate any data.
- **Media**: `![alt](url)` works today; the featured image is a first-class
  relation because it also feeds Open Graph and the amphora.

No rich-text editor dependency. The editor is a textarea with a rendered preview
beside it, which is what a markdown-native format wants and what keeps the
stored value exactly what the writer typed.

`##` headings are structural: they divide a story into the parts the free
preview counts (`lib/content/sections.ts`). Ids may be pinned as
`## The Theft {#the-theft}` so rewording a heading does not silently move the
paywall cutoff.

---

## Routes

### Public

| Route | Notes |
| --- | --- |
| `/` | The amphora, from the active collection |
| `/myths/[slug]` | A published story, or a draft under an authenticated preview |
| `/subscribe` | The subscription offer |
| `/sitemap.xml` | Published stories only, revalidated hourly |
| `/robots.txt` | Disallows `/admin` and `/api/` |
| `/api/preview` · `/api/preview/exit` | Draft Mode on and off |
| `/api/newsletter-preview` | The weekly issue as JSON |

### CMS

| Route | Notes |
| --- | --- |
| `/admin/login` | Sign in |
| `/admin` | Dashboard, filterable by status |
| `/admin/stories/[id]` | The editor |
| `/admin/stories/[id]/revisions` | History, with comparison |
| `/admin/stories/[id]/revisions/[revisionId]` | One revision, with restore |
| `/admin/collections` | Curate what the site presents |
| `/admin/media` | The image library |

Everything except `/admin/login` sits inside the `(workspace)` route group,
whose layout requires a session.

---

## Authentication

Auth.js was the obvious candidate and was not chosen. v5 is still
`5.0.0-beta.32` and unverified against Next 16; v4 predates the App Router. The
CMS needs exactly one thing — email and password for a single operator — with no
OAuth flows, which is the part of authentication that DIY actually gets wrong.

So `lib/auth/` is about 150 lines and no dependencies:

- **`password.ts`** — scrypt from `node:crypto`, salted per password, parameters
  encoded in the hash so they can be raised later. Constant-time comparison.
- **`session.ts`** — a **database row**, not a stateless JWT, so signing out (or
  revoking a stolen cookie) takes effect immediately. The cookie carries 256
  bits of randomness; what is stored is an HMAC of it under `AUTH_SECRET`, so a
  database dump yields nothing usable and rotating the secret invalidates every
  session at once. The cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in
  production.
- **`guard.ts`** — `requireUserOrRedirect()` for pages, `requireUser()` for
  mutations.

Sign-in hashes against a throwaway value when the account does not exist, so a
missing account costs the same time as a wrong password, and the error message
never says which half was wrong.

`Role` (`ADMIN` / `EDITOR`) exists on `User` from the start and is read into the
session, so per-role rules can be added without a migration or a redesign. It is
not enforced anywhere yet, because there is one operator.

**Flow:** `/admin/*` → layout calls `requireUserOrRedirect()` → redirect to
`/admin/login?next=…` → `signInAction` verifies and creates a session → back to
the requested page. Every server action independently calls `requireUser()`,
because a server action is a public HTTP endpoint and a hidden button protects
nothing.

---

## Draft and publish

```
New story ──► DRAFT ──save──► DRAFT ──publish──► PUBLISHED
                 ▲                                   │
                 └──────────── unpublish ────────────┘
                 │
                 └──archive──► ARCHIVED ──► DRAFT
```

**Save draft** validates title and slug, writes the row, and appends a revision
*if anything changed* — pressing save twice on an untouched story does not push
a real revision off the top of the history.

**Publish** additionally requires content and an excerpt, and a `previewUntil`
that still names a real section. It appends one revision of kind `PUBLISH`,
points `publishedRevisionId` at it, sets status, bumps `publishedVersion`, and
stamps `publishedAt` on the first publish only.

Publishing is save-and-publish in one action, deliberately: it is a single
editorial decision and should leave a single revision saying so.

**Unpublish** clears `publishedRevisionId` and returns the story to draft. The
draft, every revision and `publishedAt` all survive. An `UNPUBLISH` revision
records it, so the history does not show a publish followed by inexplicable
silence.

Saving is never publishing. There is no code path where a draft save touches
`publishedRevisionId`.

---

## Revisions and restore

The history page lists every revision newest-first with its kind, author,
timestamp and size, marking which is **live** and which is the **current draft**.

**Restore** copies an old revision into the working draft as a *new* revision:

```
1, 2, 3  ── restore 1 ──►  1, 2, 3, 4     (4 contains 1's content,
                                            and records that it came from 1)
```

Nothing is deleted and nothing is published — a restored draft still has to be
published to reach readers. The confirmation says exactly that, and warns about
the one thing that can surprise: an older revision may carry an older slug.

Because the draft always equals the newest revision, restoring cannot lose saved
work. It *can* lose work still unsaved in another browser tab, and the dialog
says so.

**Comparison** is at `/admin/stories/[id]/revisions`, defaulting to the two most
recent. `lib/cms/diff.ts` is a ~120-line LCS line diff with a word-level pass
inside rewritten lines — no diff dependency, because the job is two versions of
one article compared once for a human to read.

---

## Preview

Next.js **Draft Mode**, on the real route. `/myths/[slug]` renders the working
draft instead of the published snapshot; it is the actual page, not a facsimile.

The draft-mode cookie is a flag, not a credential, so on its own it would turn
every draft into a public URL. A preview therefore requires **both**:

1. draft mode enabled, and
2. a live CMS session **on that request**, re-checked on every render.

Enabling draft mode (`/api/preview?slug=…`) is itself behind a session check and
404s otherwise. There is no preview token and no secret query parameter to leak,
and revoking a session ends previews immediately rather than whenever the cookie
expires.

Verified end to end: a draft is 404 to the public, 404 with only the draft-mode
cookie, and 200 with a session.

Previews carry `robots: noindex, nofollow`, and a banner naming the state
(*draft story* or *unpublished changes to a live story*) with a way out.

### Saved, not unsaved

Preview shows the **last saved draft**. The editor states this rather than
implying otherwise: while there are unsaved changes the Preview button is
replaced by "Save before previewing — preview shows the last saved draft".
Streaming unsaved editor state into a server render would mean a second
transport for draft content and a second way for it to escape; the trade is not
worth it for one operator.

---

## Concurrent editing

`Story.lockVersion` increments on every write. The editor submits the value it
loaded; the service compares inside the transaction and refuses a mismatch with
*"This story was changed elsewhere after you opened it. Reload to see the newer
version — saving now would overwrite it."*

Not last-write-wins, not real-time collaboration. The successful writer's work
survives and the second writer is told.

There is no autosave. Explicit `Save draft` keeps the revision history
meaningful and never writes anything the writer did not ask for; the save bar
shows *Unsaved changes* / *Saved*, and leaving the page dirty is confirmed. If
autosave is added later, it should write to a separate working-state column and
*not* create revisions — see [Next steps](#possible-next-steps).

---

## Media

`lib/media/storage.ts` is the boundary: `putObject` / `removeObject` /
`storageStatus`. Vercel Blob is the implementation, imported lazily so the
package is only loaded by deployments that actually upload.

**Without `BLOB_READ_WRITE_TOKEN` everything still works.** Uploading is
switched off with an explanation and the CMS accepts external `https://` image
URLs instead. No credentials are invented and no feature silently fails.

Uploads are capped at 8 MB and limited to PNG / JPEG / WebP / AVIF / GIF. SVG is
refused on purpose: served from the site's own origin it is a script.
Dimensions are read from the file header (no image dependency) so the public
page can reserve space without a layout shift.

Alt text is an editable column, not a filename. Deleting an asset removes the
row, nulls the references, then deletes the object — that order leaves an
orphaned object rather than a dead link if the second step fails.

---

## The amphora

The vessel's painted figures are **baked into a texture atlas** by an offline
pipeline (`scripts/amphora/`). This is the one thing the CMS cannot change
alone.

- **Which stories are painted** is CMS data: give a `CollectionEntry` an
  `amphoraSlot`.
- **The painted clay** is a build artefact: `npm run content:sync` writes the
  active collection to `data/vase-panels.json`, `npm run amphora` repaints and
  verifies the textures, and the results are committed.

The collections page says this in place. `content:sync` refuses to bake a
collection that does not fill every panel, or one that would paint an
unpublished story's title onto the pot.

**Why the slot is on `CollectionEntry` and not on `Story`:** a story does not
know it is on a pot. Position is a fact about one presentation of one story in
one collection — the same story can sit at a different angle next month, or at
none. Putting it on `Story` would mean a single global position, a nullable
column that is meaningless for most rows, and content coupled to rendering.
`amphoraSlot` also stays a slot index rather than an angle, because the angles
are a property of the model's geometry and are declared once in
`lib/content/vase.ts`.

Figures themselves stay on disk at `content/figures/<slug>.png`, with an
optional `<slug>.json` sidecar for `airborne`. They are inputs to a Node build
step, not editorial content, and they belong beside the pipeline that consumes
them.

---

## Access and the paywall

Unchanged in behaviour, now sourced from the database.

`resolveStory` (`lib/access/resolve.ts`) is pure and returns a discriminated
union. The `locked` case has **no `content` and no `sections` field at all**, so
there is nothing for a template to render by accident — withholding is a
property of the value rather than a discipline the view has to remember.

Access lives on the collection entry. A story outside the active collection
falls back to the terms it last carried, and a story that has never been in a
collection is a preview — so a shared link is never a dead end.

---

## Validation and security

Validation is server-side in `lib/cms/validation.ts`; the editor mirrors some of
it for immediate feedback and none of it is trusted. Title and a well-formed
slug are required to save; content, an excerpt and a resolvable `previewUntil`
are required to publish; ids are shape-checked before they become queries;
status transitions are checked against a table.

Slug uniqueness is a database index, not a check-then-write. `P2002` is caught
and turned into a field error — including the driver-adapter error shape, where
the constraint name is nested rather than in `meta.target`.

Writes go through a fixed field list rather than spreading the caller's object,
so an input carrying extra keys writes the story's fields and nothing else.

Other properties:

- Prisma parameterises everything; no string-built SQL anywhere.
- `lib/db.ts` imports `server-only`, so importing it from a client component is
  a build error rather than a leaked credential.
- Story text reaches the browser only through `lib/content/view.ts` shapes,
  which have no content field.
- `/admin` is `noindex` at the layout and disallowed in `robots.txt`.
- Secrets are environment variables. `.env*` is gitignored except
  `.env.example`, which holds no values.

---

## Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Pooled endpoint in production |
| `DIRECT_DATABASE_URL` | only behind a pooler | Unpooled endpoint for migrations |
| `AUTH_SECRET` | yes in production | HMAC key for session cookies. Rotating it signs everyone out |
| `NEXT_PUBLIC_SITE_URL` | recommended | Absolute origin for canonicals and Open Graph |
| `BLOB_READ_WRITE_TOKEN` | no | Enables uploading. Without it, external URLs only |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | Non-interactive account creation for seed and `cms:user` |
| `TEST_DATABASE_URL` | no | Integration tests. Must be a database they may empty |
| `NEWSLETTER_PREVIEW` | no | Set to `1` to expose the newsletter JSON in production |

---

## Deployment

Vercel, plus any hosted Postgres (Neon, Supabase, RDS, Railway).

1. **Database.** Create it and set `DATABASE_URL`. If the provider gives a
   pooled endpoint, use it here and put the direct endpoint in
   `DIRECT_DATABASE_URL` — PgBouncer in transaction mode cannot run migrations.
2. **Migrations.** Set the build command to
   `prisma migrate deploy && next build`. Migrations are reproducible files
   under `prisma/migrations/`; never create production tables by hand, and never
   run `migrate dev` or `db push` against production.
3. **Auth.** Generate `AUTH_SECRET`
   (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
   Missing in production, the app refuses to start rather than falling back to a
   development key.
4. **First user.** `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run cms:user` against the
   production `DATABASE_URL`, once.
5. **Media.** Create a Vercel Blob store and add `BLOB_READ_WRITE_TOKEN`.
   Optional — external image URLs work without it.
6. **Site URL.** Set `NEXT_PUBLIC_SITE_URL` to the production origin.
7. **Amphora.** `content:sync` and `amphora` are *not* part of the build. Run
   them locally when the painted panels change and commit the textures.

Preview deployments behave normally; give them their own database if you do not
want them writing to production. Draft Mode works there as it does locally,
still requiring a CMS session.

---

## Manual end-to-end test

The whole loop, without touching source:

1. `npm run db:up && npm run db:migrate && npm run db:seed && npm run dev`
2. Visit `/` — the amphora turns and shows the five seeded myths.
3. Visit `/admin` signed out → redirected to `/admin/login`.
4. Sign in as `admin@localhost` / `amphora-dev-password` → the dashboard.
5. Type a title into **New story** → the editor opens; the slug follows the
   title as you type.
6. Write markdown with two or more `##` headings. Switch to **Rendered**.
7. **Save draft** → "Saved as revision 2".
8. Open `/myths/<slug>` in a private window → **404**. Drafts are not public.
9. Back in the editor, **Preview** (a new tab) → the real page with a
   **Preview** banner and the draft content.
10. Copy that URL into a private window → **404**. The banner's cookie is not a
    key.
11. Edit, and note the Preview button is replaced by "Save before previewing".
    Save, preview again, see the change.
12. Close the browser. Reopen `/admin` → still signed in, draft intact.
13. Edit and save twice more, then open **History** → revisions 1…N, kinds and
    authors, and a diff of the last two changes.
14. Open an older revision → **Restore this version** → confirm. Back in the
    editor with the old text, and the history now has one *more* entry, not
    fewer.
15. **Publish** → `/myths/<slug>` is public in a private window. Only the first
    part shows, with the cutoff notice — that is the paywall.
16. **Share this myth** → the native sheet on a phone, "Link copied" otherwise.
17. Edit the published story and save. Reload the public page → still the old
    text. The dashboard says **Unpublished changes**.
18. Preview → the new text. **Publish changes** → the public page catches up and
    the eyebrow reads *version 2*.
19. Change the slug of a published story → a warning that existing links will
    404.
20. Open the same story in two tabs. Save in the first, then save in the second
    → refused, with an explanation, and the first tab's work intact.
21. **Unpublish** from the dashboard → the public page 404s; history is intact;
    republishing brings it back.
22. `/admin/collections` → add the story, set **Preview**/**Locked**, reorder,
    give it a panel. The homepage index updates immediately.
23. `npm run content:sync && npm run amphora` → the figure is repainted.
24. `/admin/media` → paste an image URL with alt text, attach it as the featured
    image, republish, and check the `og:image` in the page source.
25. Sign out → `/admin` redirects to the login form again.

---

## Remaining work that needs credentials

Only one thing, and it fails softly:

**Vercel Blob.** Without `BLOB_READ_WRITE_TOKEN` the upload field is hidden and
the CMS explains why; external `https://` image URLs work fully. Add the token
and uploading turns on with no code change. Any other object store is a
replacement of the three functions in `lib/media/storage.ts`.

Everything else — database, auth, preview, revisions, publishing, the amphora
pipeline — runs entirely locally and is verified.

---

## Possible next steps

Not implemented, and not recommended without asking for them:

- **Autosave**, as a separate `draftState` column with a debounce, so it never
  creates revisions. The `lockVersion` plumbing is already in place.
- **Redirects** for changed slugs — a `StorySlugHistory` table and a 301, which
  would turn today's warning into a non-event.
- **Scheduled publishing** — `publishAt` plus a cron route.
- **Roles** — `Role` is already on `User` and in the session; enforcing
  editor-versus-admin is a guard change, not a migration.
- **Tags or series**, once there is a second kind of writing.
- **Image variants** on upload, once a storage provider is attached.
- **Content search** — Postgres full-text over `Story.content`.
