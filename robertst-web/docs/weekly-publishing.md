# The weekly publishing system

Five myths are active at a time. Free readers can start three of them and are
stopped at a line you chose; the other two stay sealed. Subscribers read all
five, entire.

Your job is to write, draw, and commit. Everything below is what the application
does with that.

- The vessel itself: [`amphora-3d.md`](./amphora-3d.md)
- The page it sits on: [`homepage-backdrop.md`](./homepage-backdrop.md)

## Publishing a week

```
content/
  myths/<slug>/meta.json      stable identity: id, slug, title
  myths/<slug>/v1.md          a version. never edited after it ships
  myths/<slug>/v2.md          a revision is a new file, not an edit
  weeks/2026-W34.json         which five are active, and how they open
public/images/myths/          drawings, named from a version's frontmatter
```

There is no CMS and no database. `git push` is the publish step.

A version file:

```markdown
---
version: 2
publishedAt: 2026-08-21
teaser: One or two sentences. Used on the amphora and in the newsletter.
drawing: prometheus-v2.webp        # optional; omit and an ornament stands in
previewUntil: the-theft            # the last part a free reader receives
---

## The Council {#the-council}

Prose.

## The Theft {#the-theft}

More prose.

## The Rock {#the-rock}

A free reader never receives this.
```

`##` headings are the story's parts. `{#id}` gives a part a stable id;
without one the id is slugified from the heading. **Point `previewUntil` at an
explicit id** — it then survives you rewording the heading in the next version.

The week file:

```json
{
  "week": "2026-W34",
  "publishedAt": "2026-08-17T06:00:00Z",
  "entries": [
    { "mythSlug": "prometheus", "version": 1, "access": "preview", "vaseSlot": 0 },
    { "mythSlug": "orpheus",    "version": 1, "access": "locked",  "vaseSlot": null }
  ]
}
```

A week goes live on its own when `publishedAt` passes, so next week can sit
finished in the repo. The active week is the most recent one whose `publishedAt`
has gone by.

Then:

```bash
npm run content:check    # week invariants
npm run content:sync     # regenerate the amphora's panel list
npm run amphora          # repaint the vessel, if its panels changed
```

## Why revisions are new files

`v2.md` never touches `v1.md`. Nothing in the loader can overwrite a published
version, because publishing is a file that already exists in git and revising is
a file that does not.

That is also what makes an archive a routing problem rather than a migration:
every version a myth ever had is still on disk, and `listVersions(slug)` already
returns them.

## How access is decided

One function, `resolveStory` in `lib/access/resolve.ts`, pure and with no way to
reach a request or the filesystem:

```
subscriber              -> full
access: "locked"        -> locked   (card only: title, teaser, drawing)
access: "preview"       -> parts[0 .. previewUntil]
```

Two structural guarantees back it up, and they matter more than the rule itself:

**`ResolvedStory` is a discriminated union.** The `locked` case has no `parts`
field at all, so there is nothing for a template to render by accident.

**The content loader is `server-only`.** `lib/content/source.ts` opens with
`import "server-only"`, so if a client component ever imports it — directly or
through a barrel file — the build fails instead of shipping every story to the
browser.

What the browser receives is `WeekView` from `lib/content/view.ts`: slugs,
titles, teasers, access states. No prose. A client component cannot leak what it
was never given.

Both the homepage and the story pages read the viewer, which makes them dynamic
routes. That is correct — what a reader may open is part of the page, so it must
not be cached across viewers.

### Replacing the entitlement stub

`getViewer()` in `lib/access/viewer.ts` is the whole seam. Today it reads a
cookie; a real provider replaces its body and nothing else changes, because no
access decision anywhere in the app looks at the cookie directly.

`/subscribe` states the offer and, outside production, offers a toggle so both
experiences can be exercised. `POST /api/dev-subscription` 404s in production.

## The vessel and the week

`VASE_SLOT_ANGLES` in `lib/content/vase.ts` declares how many figures the belly
carries and at what rotation. Every week entry claims one by index, so the vessel
holds all five stories and each is a stop the rotation settles on.

The angles are `36, 108, 180, 252, 324`, which is not arbitrary. The handles sit
at `u = 0.25` and `u = 0.75` — fixed by the lathe axis, exactly half a turn
apart. These five put the figures at `u = 0.4, 0.2, 0.0, 0.8, 0.6`, clearing
every handle root by 18 degrees. **No five-figure arrangement does better**,
because half a turn is two and a half slots, so a handle cannot fall between
figures on both sides at once. This is why the belly is one continuous
register rather than five framed panels: a frieze has no seams for a handle to
land on, and nothing divides the figures from each other.

With five slots instead of three, **width is the binding constraint on figure
scale, not height** — `build-textures.js` takes the smaller of the two and
applies one unit to every figure, so they keep the relative sizes they were drawn
at.

### Sealed figures

A sealed story is painted like any other and then put out of reach:

1. If the myth has no scene in `figures.js`, the `veiled` form is painted instead
   — a shrouded standing figure, so the frieze still reads as five.
2. Two cords are tied across the picture in a crossing X.
3. The picture is blurred, and the cords are held back from the blur so they stay
   crisp over it.

Two details matter if you touch this. The blur runs on the **shaded colour**, not
on the material ids — so the glaze is still glaze, roughness and relief stay
correct, and the obscured figure still catches light like pottery. And the cords
are rasterised with a **marker value** rather than straight to glaze: the veiled
figure underneath is glaze too, so a before/after comparison would miss exactly
the pixels where the cords cross it, which are the ones that have to survive.

A myth in a *readable* slot with no authored scene is a hard error. That is the
last manual step in the workflow: compositing an uploaded drawing into the frieze
so a new myth can be painted without hand-writing an op-list.

Regenerating is `npm run content:sync && npm run amphora`. Access state is baked
into the texture, so a week whose sealed stories change needs a repaint.

## The newsletter

`buildNewsletterIssue(siteUrl)` in `lib/newsletter.ts` returns the issue as
data: week, two or three featured stories with teaser, drawing, URL and access
state, plus the rest as titles. No provider, and never any prose — reading
happens on the site, where access is enforced.

`GET /api/newsletter-preview` returns it as JSON so the payload is reviewable
(dev only, or with `NEWSLETTER_PREVIEW=1`).

Previews lead, because a locked story is a poor opening for a free reader.

## Choosing preview vs locked

The week file is the source of truth and `content:check` enforces three and two
either way. `proposeAccess` in `lib/content/week.ts` implements the default a
publish step should suggest: **this week's new work is what free readers may
sample, and the stories retained from earlier weeks become the subscriber tail.**

The cost of that default is worth knowing: a story a free reader previewed last
week goes sealed when it is retained. Invert it if conversion matters more than
reach.

## Still to build

| | |
| --- | --- |
| Auth and payments | `getViewer` is the only place that changes |
| Archive routes | every version is on disk; this is routing, not migration |
| Email delivery | `buildNewsletterIssue` already returns the payload |
| Drawing to vase art | the last manual step in the workflow |
| Week rollover | a scheduled `content:sync` plus a build |

## Verifying

```bash
npm run content:check
npx tsc --noEmit && npm run lint && npm run build
```

`next build` doubles as the per-file content validator: the pages call the
loader, and the loader throws on a missing teaser, a bad `previewUntil`, or a
version file whose frontmatter disagrees with its filename.

Manually, against a running server:

1. **A preview stops where you said.** The part after `previewUntil` must be
   absent from the HTML source, not merely hidden.
2. **A sealed story has no prose in the source at all.**
3. **The homepage carries no story bodies** — only titles and teasers.
4. **Toggle the subscription** on `/subscribe`: both of the above open fully, and
   the seal markers under the amphora disappear.
5. **An unknown or out-of-week slug 404s.**
6. **The amphora still spins** and the myth it names is the scene facing you.
7. **A sealed stop looks sealed** — the painted figure blurred, the cords crisp
   across it, and the panel below offering to unlock rather than to read.
