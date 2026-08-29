# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev     # dev server (Turbopack) on http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint (flat config; run `npx tsc --noEmit` for type checking)
```

There is no test runner configured — no test framework, script, or test files exist yet. Verify changes with `npm run build` and `npm run lint`.

## Architecture

Next.js 16 App Router site (React 19, TypeScript strict, Tailwind CSS v4). Personal site for writings and interactive experiences, themed on Greek mythology.

- `app/layout.tsx` — root layout: site metadata plus the global `<header>` nav (Home / About). Every page renders inside it.
- `data/myths.ts` — the single source of truth for myth content. `myths` is an object literal keyed by URL slug, and `MythStory = keyof typeof myths` is derived from it. Adding a myth means adding one entry here; the slug, the type union, and the set of valid routes all follow automatically.
- `components/Amphora.tsx` — the only client component (`"use client"`). Picks a random key from `myths` on click and links to `/myths/<slug>`.
- `app/myths/[story]/page.tsx` — dynamic route that looks the slug up in `myths` and falls back to a "Myth not found" render for unknown slugs.

Key consequences of that design: myth pages are driven entirely by `data/myths.ts`, so never hardcode a slug list or a per-myth route. In Next 16 `params` is a Promise — dynamic pages must be `async` and `await params`.

Imports use the `@/*` path alias mapped to the repo root (e.g. `@/data/myths`, `@/components/Amphora`).

Styling: Tailwind v4 via `@import "tailwindcss"` in `app/globals.css`, with light/dark CSS custom properties (`--background` / `--foreground`) exposed to Tailwind through `@theme inline`. There is no `tailwind.config.js` — theme config lives in the CSS.
