# Local Development

Cappy Hub uses Supabase locally. Local and production databases have the same schema and database behavior, but different rows: local uses synthetic test data and production has real CIC data. Rows are never copied between them.

## First-time setup

Run:

```bash
npm run local:setup
npm run dev
```

`local:setup` runs the full local reset. It starts Supabase, replays migrations, loads the synthetic `supabase/seed.sql`, creates local Auth test accounts, links those accounts to synthetic officers, and writes the local public URL and publishable key to `.env.local`.

## Local test accounts

Use these emails on the local login page. Every account uses the same local-only password: `CappyLocal123!`.

| Role              | Local email                |
| ----------------- | -------------------------- |
| Admin             | `admin@cappy.test`         |
| President         | `president@cappy.test`     |
| VP Operations     | `vp-operations@cappy.test` |
| VP Academics      | `vp-academics@cappy.test`  |
| Intro Lead        | `intro-lead@cappy.test`    |
| ICPC Lead         | `icpc-lead@cappy.test`     |
| Social Lead       | `social-lead@cappy.test`   |
| Outreach Lead     | `outreach-lead@cappy.test` |
| Multi Branch Lead | `multi-lead@cappy.test`    |
| Secretary         | `secretary@cappy.test`     |
| Officer           | `officer@cappy.test`       |
| Inactive Officer  | `inactive@cappy.test`      |

These synthetic accounts are created only by the local setup/reset workflow. Never use this password or these accounts in production.

## Seeded demo scenarios

`supabase/seed.sql` adds synthetic records across Officers, Events, Points, warnings, and Tasks. Names beginning with `Mock:` identify demo Events. The Time Slot examples are:

- `Mock: Equal Slots Volunteer Fair`: three equal shifts with capacities of 3, 2, and unlimited; existing selections demonstrate available and full shifts.
- `Mock: Custom Slots Outreach Booth`: custom shifts with a gap, a full first shift, and an available second shift.
- `Mock: Processed Slots Career Day`: a past Event with separate Point transactions for selected slots and one removed selection whose award remains in history.
- `Mock: Full Capacity Workshop`: both Time Slots are full; no Event-wide capacity is applied.
- `Mock: Event Capacity Workshop`: an unslotted Event that retains Event-wide Max volunteers.
- `Mock: Weekly Coding Workshop`: two recurring occurrences with independent slots and Officer selections.

The remaining seeded records cover past, upcoming, happening, cancelled, removed, and Session Events; Point awards, corrections, and removals; warning approval states; and Tasks with no assignee, one or several assignees, completed assignments, and due-date awards. Run `npm run local:reset` to restore these examples after changing local data.

## Visual review and automated testing

Cappy Hub does not use automated browser testing in local development, GitHub Actions, CI/CD, or deployment validation. Do not install, launch, or configure browsers for automated checks, and do not generate screenshots automatically. This includes Playwright and browser-based accessibility checks.

Use the existing Vitest, PostgreSQL/pgTAP, migration, authorization, lint, format, type, and production build checks where applicable. Preview and Production smoke checks remain HTTP-only. Manual visual review is supported. Screenshots may be attached directly to Pull Requests when they help reviewers understand a UI change.

For local interactive development, `npm run local:reset` prepares synthetic data and local Auth accounts. It is destructive to the local database; see [Rebuild local from scratch](#rebuild-local-from-scratch) before using it.

## Daily development

After pulling the latest code:

```bash
git pull
npm run local:start
npm run dev
```

`local:start` starts the full local Supabase stack. Supabase applies repository migrations when starting the local stack. This command does not reset the database. If Supabase is already running and you need to apply newly added migrations, run:

```bash
npx supabase migration up --local
```

## Rebuild local from scratch

`npm run local:reset` is destructive to the local database. It stops and starts the local stack, rebuilds the database from migrations, loads the synthetic seed, recreates Auth test accounts, and updates `.env.local`.

Use it when you intentionally want to discard local changes and return to the synthetic development dataset. It does not affect production.

## Local Supabase Studio

Studio runs at <http://localhost:54323>. Use it only with the local database. If a schema change should become part of Cappy Hub, create a migration and commit it; do not rely on a manual Studio change.

## Environment variables and credentials

`npm run local:setup` and `npm run local:reset` manage the public Supabase URL and publishable key in `.env.local`. The local setup script uses the local service-role key only on the server while creating test accounts. It does not write that key into browser environment variables.

Never commit `.env.local`, passwords, OAuth secrets, production database credentials, or Supabase service-role/secret keys.
