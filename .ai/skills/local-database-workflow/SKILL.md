---
name: local-database-workflow
description: Put local Supabase into the correct state before Cappy Hub database, application, seed, or browser tests.
---

# Local database workflow

Use this skill whenever running the full test suite, using local Supabase, switching between test and app data, or diagnosing local database failures. Check current `package.json` scripts if commands have changed.

## pgTAP and full `npm test`

Always prepare a migrations-only local database before the full suite:

```bash
npm run db:start
npm run db:reset
npm test
```

`db:start` starts the reduced local Supabase/database stack but does not reset rows. `db:reset` recreates the local database from migrations with no synthetic development seed. `npm test` includes `tests/database.test.ts`, which runs `supabase test db --local`; PostgreSQL is expected at `127.0.0.1:54322`. pgTAP tests assume this isolated migrations-only database and create their own fixtures. Never run the database suite against an arbitrary existing local state. Reset first unless the immediately preceding documented command guarantees a clean migrations-only database.

## Local app and Playwright

For interactive development or browser tests, use the distinct seeded state:

```bash
npm run local:reset
```

This starts the full stack, replays migrations, loads synthetic `supabase/seed.sql`, creates local Auth accounts, links synthetic Officers, and updates `.env.local`. For browser smoke:

```bash
npm run local:reset
npm run build
npm run test:e2e
```

Install Chromium first only when needed: `npx playwright install chromium`.

`db:reset` → migrations-only DB → correct for `npm test` / pgTAP.
`local:reset` → seeded DB plus Auth accounts → correct for local app / Playwright.
After pgTAP, run `npm run local:reset` to restore the app. After local development or Playwright, run `npm run db:reset` before full `npm test`.

## Diagnose failures

- For `ECONNREFUSED 127.0.0.1:54322`, do not immediately blame application/database code. Check Docker is available, then run `npm run db:start`, `npm run db:reset`, and `npm test`.
- For suspicious pgTAP counts (`expected 1, got 7`, `expected 4, got 28`, `expected 2, got hundreds`) or `more than one row returned by a subquery`, suspect the synthetic local seed. Run `npm run db:reset` then `npm test` before investigating product behavior.
- If Docker is unavailable, do not claim the full suite passed. If useful, run `npm test -- --exclude tests/database.test.ts`, clearly report that local pgTAP/database verification could not run, and require hosted CI to verify the disposable database suite.

## Related database checks

- Migration replay / normal DB tests: `npm run db:start`, then `npm run db:reset`.
- Generated types when schema affects app types: `npm run db:types`, then `npm run db:types:check`.
- Historical migration preservation: `npm run test:db:upgrade` when relevant.
- Synthetic seed verification: `npm run db:reset`, then `npm run test:local-seed`; seed verification expects an empty migrations-only database.
- Restore the full local app afterward with `npm run local:reset`.

## Safety

All destructive commands in this workflow must target local Supabase only. Never test against production, run synthetic seed data against production, use `supabase db reset --linked`, reset a hosted database, weaken RLS to pass tests, expose service-role credentials, or mutate production to diagnose a local failure.
