# Database Development

Supabase provides Cappy Hub's PostgreSQL database, authentication, Row Level Security, database functions, and scheduled database processing.

## Source of truth and data separation

`supabase/migrations/` is the source of truth for schema and database behavior. `supabase/seed.sql` is synthetic local development/test data only.

Local and production share the schema through migrations. They have different data: local has synthetic test rows, production has real CIC rows. Never copy rows between them, and never run the seed against production.

Do not edit production schema in the Supabase Dashboard or SQL editor. Make the change in a migration, validate it, and merge it through a PR.

The seed includes synthetic active and inactive officers, catalog values, events and signups, participation and manual points, warnings, audit history, and task assignments. Local Auth accounts are created separately by `scripts/setup-local-dev.mjs`; they are not production users or seed data.

## Making a database change

Create a migration:

```bash
npx supabase migration new descriptive_name
```

Include the migration and related application changes in the same PR. Review queries, RPCs, validation, generated types, tests, and seed data affected by the schema change. Regenerate and check TypeScript database types when needed:

```bash
npm run db:types
npm run db:types:check
```

Commit regenerated `lib/database.types.ts` when the schema changes application query/write types. CI regenerates types from its migrated local database and fails if the committed file is stale.

Use `npm run local:reset` to prove the full migration history and seed rebuild local from scratch. This destroys the local database, never production.

Prefer additive migrations when changing a structure used by deployed code. For risky renames or removals, add and backfill the new structure, switch application code, then remove the old structure in a later migration. Ensure new `NOT NULL` constraints work with existing production rows, and use explicit conversions for data type changes.

Do not delete catalog rows referenced by historical records. For example, `events.event_type_id` references `event_types` with `ON DELETE RESTRICT`. Check references before changing event types, branches, or positions; retire referenced values instead of removing their history. Preserve past business values when they need to remain meaningful; add a specific snapshot only when a real workflow requires it.

Keep authorization and important validation in trusted server actions or SQL functions, with database constraints for data integrity. UI filtering alone is not enforcement. Never disable RLS as a shortcut. Never edit a migration already applied to production; create a new migration for follow-up changes.

## Manual production database update

Follow this checklist only after the database feature PR has been fully validated locally and passed CI, received approval, and is ready to ship. Merge the PR to `main` before applying anything to production.

1. Pull the merged `main` and update local Supabase. `local:start` is the normal non-destructive workflow; `local:reset` rebuilds local from scratch and discards its current rows.

   ```bash
   git switch main
   git pull
   npm run local:start
   ```

   If the local stack is already running and has pending migrations, apply them with:

   ```bash
   npx supabase migration up --local
   ```

2. Check local migration history, link the CLI to the production Cappy Hub project, then compare local and remote history. Replace the placeholder with the production project's Reference ID from Supabase Project Settings. If this CLI installation is not authenticated yet, run `npx supabase login` first.

   ```bash
   npx supabase migration list --local
   npx supabase link --project-ref <PRODUCTION_PROJECT_ID>
   npx supabase migration list
   ```

   The link command prompts for the production database password. Enter it at the prompt; do not put it in a command or commit it. In the combined migration list, production-only migration versions or unexpected history differences mean stop and reconcile before continuing. New migrations merged on `main` may be local-only until deployed.

3. Preview the production push. Review the migrations in the output and confirm they are the intended pending changes.

   ```bash
   npx supabase db push --dry-run
   ```

4. Only if the dry run is clean, apply pending migrations:

   ```bash
   npx supabase db push
   ```

   `db push` applies pending migrations; do not add `--include-seed`.

If production was changed manually outside migrations, or its schema/history does not match the expected migration state, stop before `db push`. Reconcile the drift with a maintainer and record the intended change through a new migration before proceeding. Do not repair migration history blindly.

Never run `supabase db reset --linked` against production, run `supabase/seed.sql` against production, or copy local test data to production.

After the push, `npx supabase migration list` should show local and production histories aligned. If production-only versions or other differences appear, stop and reconcile them before doing another push.

## Database test stack

The CI and PostgreSQL test stack is smaller than the full local development stack:

```bash
npm run db:start
npm run db:reset
npm test
```

`db:reset` recreates only the local test database and skips seed data. `db:start` omits Auth, API, Studio, and other services used by the full local app environment.

`npm run test:db:upgrade` exercises a historical populated database upgrade, then resets the local database to the latest migrations without seed data. It discards current local rows and Auth accounts; run `npm run local:reset` afterward if you want to restore the full local development dataset. `npm run test:local-seed` loads synthetic seed rows into the local database and expects it to be empty; do not run it over existing local development data.

CI replays all migrations against a fresh local database, runs the PostgreSQL and application tests, checks an existing-data migration upgrade, verifies generated types and the synthetic seed, runs Supabase database lint, and builds the application. The matching local checks include `npm run test:db:upgrade` and `npm run test:local-seed`.

Keep Row Level Security enabled for exposed tables. Never put service-role/secret keys in browser code, rely only on UI filtering for authorization, disable RLS to make deployment easier, or test against production data.
