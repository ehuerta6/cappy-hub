# Local Development

Cappy Hub uses Supabase locally. Local and production databases have the same schema and database behavior, but different rows: local uses synthetic test data and production has real CIC data. Rows are never copied between them.

## First-time setup

Run:

```bash
npm run local:setup
npm run dev
```

`local:setup` runs the full local reset. It starts Supabase, replays migrations, loads the synthetic `supabase/seed.sql`, creates local Auth test accounts, links those accounts to synthetic officers, and writes the local public URL and publishable key to `.env.local`.

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

## Test accounts

The local login page has test accounts for these roles:

- Admin
- President
- VP Operations
- VP Academics
- Intro Lead
- ICPC Lead
- Social Lead
- Outreach Lead
- Multi Branch Lead
- Secretary
- Officer
- Inactive Officer

These password accounts exist only for local development. Production uses Google Sign-In.

## Local Supabase Studio

Studio runs at <http://localhost:54323>. Use it only with the local database. If a schema change should become part of Cappy Hub, create a migration and commit it; do not rely on a manual Studio change.

## Environment variables and credentials

`npm run local:setup` and `npm run local:reset` manage the public Supabase URL and publishable key in `.env.local`. The local setup script uses the local service-role key only on the server while creating test accounts. It does not write that key into browser environment variables.

Never commit `.env.local`, passwords, OAuth secrets, production database credentials, or Supabase service-role/secret keys.
