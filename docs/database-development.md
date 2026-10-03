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

## Production deployment

After a PR is merged to `main`, the existing CI workflow runs the normal quality checks. When CI succeeds, `.github/workflows/deploy-production.yml` checks out that exact `main` commit and runs these steps in order:

1. Link the Supabase CLI to the configured production project.
2. Compare `supabase/migrations/` with production migration history. Production history must match a prefix of the local migration list; migrations in `main` that have not reached production are allowed.
3. Run `supabase db push --dry-run`, then apply pending migrations with `supabase db push` (without `--include-seed`).
4. Verify production history is fully aligned with `supabase/migrations/`.
5. Pull Vercel production settings, build the application, and deploy it with `vercel deploy --prebuilt --prod`.

Any failed step stops the workflow before the next step. A CI failure skips production deployment. A migration history mismatch, a failed dry run, or a failed migration prevents the application build and deploy. If the final history check fails, the application is not deployed; contact a maintainer to investigate.

### Required GitHub configuration

Add the following repository or `production` environment configuration. The workflow uses the `production` environment, so configure its secrets and variables there:

| Name                    | Type     | Purpose                                                         |
| ----------------------- | -------- | --------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Secret   | Authenticates Supabase CLI project linking                      |
| `SUPABASE_DB_PASSWORD`  | Secret   | Authenticates migration history reads and migration application |
| `VERCEL_TOKEN`          | Secret   | Authenticates Vercel CLI                                        |
| `SUPABASE_PROJECT_REF`  | Variable | Supabase production project Reference ID                        |
| `VERCEL_ORG_ID`         | Variable | Vercel team or account ID                                       |
| `VERCEL_PROJECT_ID`     | Variable | Vercel project ID                                               |

Keep credentials in GitHub configuration. Never commit them or expose Supabase service-role credentials to application or browser code.

### One-time Vercel project setting

Vercel Git integration currently deploys automatically. Before merging this deployment workflow, open the Vercel project’s **Settings → Environments → Production → Branch Tracking** and change **Production Branch** from `main` to the reserved branch name `workflow-only`. Do not push commits to `workflow-only`. Production deployments will then come from the gated GitHub Actions workflow using the Vercel CLI. Pull request branches continue to receive normal Preview deployments. The repository’s `vercel.json` also disables Git-triggered deployments from `main`.

If this Vercel project cannot use a reserved production branch, disable automatic Git deployments for `main` in its project Git settings before merging. Do not rely on the GitHub workflow alone while Vercel can independently promote `main` pushes.

### Migration history and failure handling

`supabase/migrations/` is the schema source of truth. Before applying anything, the workflow stops if production records a version missing from the repository or if production history is not a prefix of the local migration history. That permits expected pending migrations while catching production-only versions and gaps. It never runs `migration repair`, resets production, runs seeds, or includes seed data in `db push`.

If drift is reported, deployment stops. A maintainer must inspect production and the migration files, determine the correct state, and record any required schema changes in a new migration before retrying. Never repair migration history blindly. Once a migration reaches production, keep its version, filename, and contents unchanged; use a new migration for follow-up changes. A migration or deployment failure leaves the previous Vercel production application active. Fix the failure and retry by merging a follow-up commit to `main`.

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
