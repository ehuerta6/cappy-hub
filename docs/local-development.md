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
