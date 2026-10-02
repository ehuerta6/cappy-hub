# Database Development

Supabase provides Cappy Hub's PostgreSQL database, authentication, Row Level Security, database functions, and scheduled database processing.

## Source of truth and data separation

`supabase/migrations/` is the source of truth for schema and database behavior. `supabase/seed.sql` is synthetic local development/test data only.

Local and production share the schema through migrations. They have different data: local has synthetic test rows, production has real CIC rows. Never copy rows between them, and never run the seed against production.

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

Use `npm run local:reset` to prove the full migration history and seed rebuild local from scratch. This destroys the local database, never production.

Prefer additive migrations when changing a structure used by deployed code. For risky renames or removals, add and backfill the new structure, switch application code, then remove the old structure in a later migration. Ensure new `NOT NULL` constraints work with existing production rows, and use explicit conversions for data type changes.

Do not delete catalog rows referenced by historical records. For example, `events.event_type_id` references `event_types` with `ON DELETE RESTRICT`. Retire referenced values instead of removing their history. Preserve past business values when they need to remain meaningful; add a specific snapshot only when a real workflow requires it.

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

2. Check local migration history, link the CLI to the production Cappy Hub project, then compare local and remote history. Replace the placeholder with the production project's Reference ID from Supabase Project Settings.

   ```bash
   npx supabase migration list --local
   npx supabase link --project-ref <PRODUCTION_PROJECT_ID>
   npx supabase migration list
   ```

   In the combined migration list, production-only migration versions or unexpected history differences mean stop and reconcile before continuing. New migrations merged on `main` may be local-only until deployed.

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

## Database test stack

The CI and PostgreSQL test stack is smaller than the full local development stack:

```bash
npm run db:start
npm run db:reset
npm test
```

`db:reset` recreates only the local test database and skips seed data. `db:start` omits Auth, API, Studio, and other services used by the full local app environment.
