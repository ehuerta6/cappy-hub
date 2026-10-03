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

## Browser smoke tests

The Playwright smoke suite uses the rendered local app and local Supabase. Before each run, reset the database to its synthetic seed, build the app, install Chromium once, then run the suite:

```bash
npm run local:reset
npx playwright install chromium
npm run build
npm run test:e2e
```

The suite does not reset data itself. `local:reset` clears prior local changes, reloads the synthetic seed, creates the local Auth accounts, and updates `.env.local`. Run it again before rerunning the suite so the stable `E2E Event - Core Workflow` and `E2E Task - Approval Workflow` records start from a clean database.

Tests run serially against a locally started production build. They sign in through the local login page using the seeded **Admin**, **Officer**, and **Inactive Officer** accounts. The Admin creates and updates an Event, adds the Officer as a participant, and tests the Event cancellation confirmation and filtered return navigation. A separate Task workflow has the Admin create and assign a Task, the Officer complete it, and the Admin approve it before checking the awarded Task Point in Point History. The inactive account must reach Access denied. Selectors use the app's visible labels, links, buttons, headings, and tables.

CI runs the normal database checks first, then resets to the seeded local app environment, builds, installs Chromium, and runs the same serial suite. It uploads Playwright traces and screenshots on a browser test failure as the `playwright-results-<run id>` artifact. Local failure artifacts are written under `test-results/`.

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
