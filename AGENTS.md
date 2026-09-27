<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Cappy Hub — Agent Guide

## Project at a glance

Cappy Hub is an internal administrative app for the Coding Interview Club. Its core areas are Officers, Events, Points, and a Dashboard that summarizes them. The current app is a proof of concept; do not imply authentication or production authorization is complete.

The stack is Next.js App Router, React, TypeScript, Supabase/PostgreSQL, npm, and Tailwind CSS. Follow the patterns already in the relevant route and migration. Keep changes focused and avoid new dependencies or unrelated product areas.

## Where to look

- `README.md` documents setup, current behavior, database structure, and GitHub conventions.
- `docs/product/design-doc.md` is the canonical source for product requirements and decisions.
- `docs/progress/mvp-implementation-checklist.md` tracks implementation evidence and release readiness; it does not define product requirements.
- `app/` contains route pages, forms, and Server Actions.
- `lib/` contains shared Supabase types and domain helpers.
- `supabase/migrations/` is the versioned database schema history. Add schema changes as migrations; do not hand-edit generated database types independently of the schema workflow.
- `components/` contains shared UI.

## Skill and workflow guide

- **Cappy Hub GitHub workflow** — use `.agents/skills/cappy-hub-github/SKILL.md` for branch setup, commit naming, PR titles/descriptions, checks, squash merging, and cleanup.
- **Checklist maintenance** — use `.agents/skills/cappy-hub-checklist/SKILL.md` after implementation work to update checklist items from repository evidence.
- **Supabase work** — when the Supabase skill is available, use it for schema, migrations, SQL, RLS, RPCs, or Supabase integration. Keep schema changes in migrations and never expose service-role credentials.
- **Next.js changes** — follow the generated Next.js instructions above and consult the installed Next.js documentation for the APIs being changed.

## Verification

Use the scripts in `package.json` as appropriate for the change: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`. Do not claim a check passed unless it was run or required GitHub CI reports it passed. Keep `.env.local`, credentials, and secrets out of Git.
