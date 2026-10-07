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

### Rollout-compatible schema changes

Production applies migrations before the new application deployment. Every migration must therefore keep working with the currently deployed application while rollout is in progress. Use **expand → migrate/backfill → deploy compatible application → contract later**; do not combine a breaking schema change and the first application release that knows about it.

- **Add a column:** Prefer a nullable column or a safe default first. Deploy code that can work with both old and new rows (and, when needed, reads or writes both forms). Backfill historical rows in a controlled step, verify the result, then add and validate constraints. Make the column `NOT NULL` in a later migration only when all supported application versions and existing rows satisfy it. Cappy Hub's `events.location_id` transition is a useful pattern: retain the existing `events.location` snapshot while adding and backfilling reusable locations.
- **Remove a column:** First deploy code that no longer reads or writes it. After that application version has deployed and the rollout window has passed, remove the column in a later migration. Do not drop `events.location` in the release that first stops using it.
- **Rename a column or table:** Treat a rename as breaking because the old application still queries the old name. Add the new name, synchronize/backfill it while both names exist, deploy code that transitions to the new name, and drop the old name only in a later contract migration. Apply the same process when renaming a table used by the application.
- **Change a type:** If existing queries, writes, generated types, or returned values may be incompatible, stage the conversion. Add a compatible replacement column or representation, backfill and verify it, transition application code, and remove the old representation later. Do not cast a live column in place while the old application expects its previous type.
- **Change an RPC or view:** Treat functions and views exposed through Supabase/PostgREST as application APIs. Preserve argument names/types and returned fields while the old application can call them. Add a new RPC or returned field first, deploy consumers, and only later remove the old RPC or field. Dropping or renaming a public RPC, or removing a view field, can break the currently deployed application.
- **Tighten a constraint:** For checks and foreign keys where PostgreSQL supports it, add the constraint `NOT VALID`, inspect and fix historical rows, then `VALIDATE CONSTRAINT`. Add required columns as nullable first and validate historical data before making them required. For example, add a check on `events` as `NOT VALID`, correct existing rows that fail it, validate it, and only then rely on it for new writes.

Task assignment cardinality is an example of an expand-and-transition rollout. PR #132 added and backfilled `task_officer_assignments` with `(task_id, officer_id)` identity while preserving the deployed app's singular `task_assignments` relation and legacy RPCs. The old table remains a single-row compatibility projection; it is not the source for the current Task UI. The #135 contract migration revokes client execution of `public.complete_task(bigint)`, `public.approve_task(bigint)`, and their private completion, approval, and award helpers after production is confirmed to serve the current application. It keeps their definitions, the legacy table, and all historical assignment, approval, point, audit, and recurrence data. Current managers use `set_task_assignment_completion`; Officers retain the supported self-assignment path. Due Task awards use a private, idempotent scheduled processor and Denver calendar dates; clients cannot call that processor directly.

#### Issue #135 Task RPC contract

A direct read-only production check confirmed that `/login` returned the expected Cappy Hub login surface and revision header for main commit `07ed1d1413af6aa97c72b58f289d31cabbcd37cf` before the #135 contract migration was prepared. The legacy completion and approval RPCs remain defined for historical compatibility, but clients cannot execute either public RPC or the private implementation/award helpers. The new manager-controlled completion RPC owns current completion updates; assignment and approval history stays readable, and existing Task point history remains available.

New migration files are checked by `scripts/check-destructive-migrations.mjs` for potentially rollout-incompatible operations. It considers only `.sql` migrations added relative to the CI base: the PR base SHA for pull requests, or the previous commit on pushes to `main`. Existing migrations are not re-scanned. The separate migration immutability check continues to reject edits, deletions, or renames of files already present in the base.

The guard flags `DROP COLUMN`, `DROP TABLE`, table/column renames, public view/RPC renames, `ALTER COLUMN ... TYPE`, `DROP VIEW`, and `DROP FUNCTION` (which may remove a public RPC). It ignores SQL comments, quoted strings, and dollar-quoted function bodies so examples or text containing these phrases do not trigger it. For a reviewed contract-phase migration, put this explicit header at the beginning of that migration and give a concrete rationale of at least 30 characters:

```sql
-- cappy-hub: approve-destructive-migration
-- reason: app stopped reading events.location in PR #123 and a full production deployment passed
ALTER TABLE public.events DROP COLUMN location;
```

The header approves only that migration file. Keep the relevant transition and deployment evidence in the rationale; a missing, misplaced, or short rationale does not bypass the guard. Use the escape hatch only after checking that the old application no longer needs the structure.

Do not delete catalog rows referenced by historical records. For example, `events.event_type_id` references `event_types` with `ON DELETE RESTRICT`. Check references before changing event types, branches, or positions; retire referenced values instead of removing their history. Preserve past business values when they need to remain meaningful; add a specific snapshot only when a real workflow requires it.

Keep authorization and important validation in trusted server actions or SQL functions, with database constraints for data integrity. UI filtering alone is not enforcement. Never disable RLS as a shortcut. Never edit a migration already applied to production; create a new migration for follow-up changes.

CI compares migration files with the PR base on pull requests and with the previous commit on pushes to `main`. It allows new migration files and rejects modification, deletion, or renaming of migrations already present in that base. A direct push that changes an existing migration fails CI, so the production workflow does not continue. Protect `main` by requiring PRs so invalid changes are stopped before reaching the branch.

## Production deployment

After a PR is merged to `main`, the existing CI workflow runs the normal quality checks. When CI succeeds, `.github/workflows/deploy-production.yml` checks out that exact `main` commit and runs these steps in order:

1. Compare `supabase/migrations/` with production migration history using `SUPABASE_DB_URL`. Production history must match a prefix of the local migration list; migrations in `main` that have not reached production are allowed.
2. Run `supabase db push --db-url "$SUPABASE_DB_URL" --dry-run` (without `--include-seed`).
3. Apply pending migrations with `supabase db push --db-url "$SUPABASE_DB_URL"` (without `--include-seed`).
4. Verify production migration history is fully aligned with `supabase/migrations/`.
5. Trigger the configured Vercel Production Deploy Hook. It starts Vercel's deployment only after migrations have been applied and verified.
6. Poll the canonical production `/login` route until the CI-approved commit serves the expected Cappy Hub login surface, or fail after ten minutes.

Any failed step stops the workflow before the next step. A CI failure skips production deployment. A migration history mismatch, failed dry run, failed migration, or final history check prevents the hook from being called, so the new application never receives production traffic before its migrations succeed. A failed Vercel deployment leaves the previous application active.

### Required GitHub configuration

Add the following repository or `production` environment configuration. The workflow uses the `production` environment, so configure its secrets and variables there:

| Name                     | Type                  | Purpose                                                                                                                |
| ------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_DB_URL`        | Secret                | Production Supabase Postgres Session Pooler connection string, including its database password                         |
| `VERCEL_DEPLOY_HOOK_URL` | Secret                | Vercel Production Deploy Hook URL                                                                                      |
| `PRODUCTION_APP_URL`     | Variable (non-secret) | Canonical production HTTPS origin, shaped like `https://<production-domain>`; no credentials, path, query, or fragment |

These are the only production environment secrets required by GitHub Actions. Store both in the `production` environment. The workflow does not print the database connection string or deploy hook URL. Never commit them or expose Supabase service-role credentials to application or browser code.

Use the production project's Postgres Session Pooler connection string and URL-encode any special characters in its database password, as required for connection URLs.

### One-time Vercel project setting

Keep the Vercel project's **Production Branch** set to `main`. The repository's `vercel.json` disables automatic Git-triggered production deployments from `main`; GitHub Actions applies pending migrations and verifies migration history alignment before it sends a POST request to the Production Deploy Hook configured for `main`. Pull request and feature branch Preview deployments remain enabled.

Configure `VERCEL_DEPLOY_HOOK_URL` as a Production Deploy Hook for the `main` branch. No reserved production branch is needed.

Keep **Enable access to System Environment Variables** enabled in the Vercel project's Environment Variables settings. Vercel supplies `VERCEL_GIT_COMMIT_SHA` at build time; `next.config.ts` publishes that public commit SHA as `x-cappy-hub-revision` on `/login`. No Vercel API token or manually maintained SHA variable is required. See [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

### Production smoke verification

`scripts/verify-production-deployment.mjs` runs only after the migration alignment check and successful deploy hook request. The hook is asynchronous, so its success does not finish the workflow. The script sends unauthenticated GET requests to `${PRODUCTION_APP_URL}/login` with cache revalidation requested. It requires all of:

- HTTP 200 and an HTML content type, without following redirects.
- The rendered `Cappy Hub` heading, `Coding Interview Club administration` description, and `Continue with Google` button. Matching ignores scripts and HTML comments rather than taking a full HTML snapshot.
- `x-cappy-hub-revision` equal to the successful CI run's full commit SHA. A healthy previous deployment cannot satisfy the check for a newer commit.

The script checks immediately, then retries ten seconds after each unsuccessful attempt. Each request, including its response body, has a ten-second limit capped by the remaining overall budget. The total polling budget is ten minutes; the Actions step also has an eleven-minute timeout as a backstop. A missing/invalid URL or expected SHA fails immediately. Timeout exits nonzero and fails the production workflow; there is no `continue-on-error` or automatic repair/rollback.

This proves the expected build is reachable and Next.js serves its login route. It does not exercise browser JavaScript, Google OAuth, authenticated workflows, or database business operations. No cookies or authentication credentials are sent, and no test accounts or business rows are created. Browser workflow testing belongs in the disposable/local smoke suite (#75).

Before merging changes that enable this check, set the non-secret `PRODUCTION_APP_URL` variable in GitHub's `production` environment to the stable public production origin (custom domain or stable Vercel production domain). Do not use a temporary deployment or Preview URL. Confirm Vercel system variables are enabled. The production login route must be publicly reachable; do not add a deployment-protection bypass secret or weaken application authentication to make the check pass.

On failure, the Actions log shows the checked URL, each attempt number, HTTP status (or `unavailable`), whether expected content and revision were found, and the final timeout reason. Response bodies, raw network errors, cookies, auth tokens, database URLs, and deploy hook URLs are not logged. Troubleshoot using these results:

- Missing/invalid configuration: check `PRODUCTION_APP_URL` in the GitHub `production` environment.
- Connection errors, timeouts, or non-200 status: check production DNS/domain configuration, reachability from Actions, deployment protection, and Vercel deployment/build/runtime logs.
- HTTP 200 with unexpected content: inspect `/login` manually for a platform error/default page or an unintended login-surface change. Update the small content assertions only when the intended surface changes.
- Expected content found but revision mismatch: the previous build may still be serving. Check that Vercel finished deploying the intended `main` commit, its production domain points to that build, and system environment variables are enabled. A missing header is also a failure. Deploy Hooks build the branch tip; if `main` advanced since the checked CI run, this check fails safely rather than accepting a different SHA.

A smoke failure reports that the expected production response was not verified. Migrations may already have succeeded and Vercel may already have switched traffic; the smoke check does not undo either operation or guarantee the previous application remains active. Inspect the deployment, fix the cause, and merge a follow-up commit to `main` through the normal CI/migration flow. Do not repair migration history or mutate production data to fix a smoke failure.

### Migration history and failure handling

`supabase/migrations/` is the schema source of truth. Before applying anything, the workflow stops if production records a version missing from the repository or if production history is not a prefix of the local migration history. That permits expected pending migrations while catching production-only versions and gaps. It never runs `migration repair`, resets production, runs seeds, or includes seed data in `db push`.

Production migrations must remain backward-compatible and additive so the previous application deployment stays valid if migrations succeed but the final Vercel deployment fails. If drift is reported, deployment stops. A maintainer must inspect production and the migration files, determine the correct state, and record any required schema changes in a new migration before retrying. Never repair migration history blindly. Once a migration reaches production, keep its version, filename, and contents unchanged; use a new migration for follow-up changes. A migration or Vercel build failure leaves the previous Vercel production application active; a smoke verification failure may occur after traffic has switched, as described above. Fix the failure and retry by merging a follow-up commit to `main`.

## Database test stack

The CI and PostgreSQL test stack is smaller than the full local development stack:

```bash
npm run db:start
npm run db:reset
npm test
```

`db:start` starts the reduced local database stack; it does not reset existing rows. `db:reset` recreates only the local test database from migrations and skips synthetic seed data. The full `npm test` includes `tests/database.test.ts`, which runs `supabase test db --local` against PostgreSQL at `127.0.0.1:54322`. These pgTAP tests create their own fixtures and require the isolated migrations-only state above. Never run the full suite against an arbitrary existing local database; reset first unless the immediately preceding command already guarantees that clean state. The reduced stack omits Auth, API, Studio, and other services used by the full local app environment.

`npm run test:db:upgrade` exercises a historical populated database upgrade, then resets the local database to the latest migrations without seed data. It discards current local rows and Auth accounts; run `npm run local:reset` afterward if you want to restore the full local development dataset. `npm run test:local-seed` loads synthetic seed rows into the local database and expects it to be empty; do not run it over existing local development data.

Any migration that transforms or removes historical structure must include representative pre-migration fixture data and preservation assertions when existing rows could be affected. Add data to a focused `supabase/fixtures/pre-<change>.sql` fixture that represents the schema immediately before the migration. Extend `scripts/test-db-upgrade.mjs` to apply that fixture at the correct point in the historical replay, then add assertions to `supabase/upgrade-tests/preservation.test.sql` comparing the migrated result with the captured pre-migration values. Update the replay boundary there when a new historical milestone is introduced. Extend the fixture, runner, and assertions together so the test demonstrates what historical values and relationships survive the change. A purely additive change that cannot transform or remove existing rows may not need extra preservation data.

CI replays all migrations against a fresh local database, runs the PostgreSQL and application tests, checks an existing-data migration upgrade, verifies generated types and the synthetic seed, runs Supabase database lint, and builds the application. The matching local checks include `npm run test:db:upgrade` and `npm run test:local-seed`.

Keep Row Level Security enabled for exposed tables. Never put service-role/secret keys in browser code, rely only on UI filtering for authorization, disable RLS to make deployment easier, or test against production data.
