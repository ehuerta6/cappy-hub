# Cappy Hub

Cappy Hub is an internal administrative application for the Coding Interview Club. This initial functional proof of concept connects Officers → Events → Signups → Scheduled completion → Participation points → History/totals → Dashboard.

## Current scope

- Officers: create, list, view, edit, deactivate/reactivate; one controlled position, optional academic classification and separate optional UTEP/personal emails, multiple branches.
- Events: create, list, view, edit upcoming events, cancel before the scheduled end, multiple branches, add/remove active officers while signup is open.
- Points: automatic scheduled participation awards, positive/negative fractional manual transactions and corrections, officer totals calculated with SQL `SUM`.
- Connected profiles: officer events and point history; event participants and related transactions.
- Dashboard: active officers, upcoming events, signed points this half-year, upcoming schedule and recent point activity. These are queries, not stored statistics.

Stack: Next.js App Router, React, TypeScript, Supabase/PostgreSQL, npm, existing Tailwind CSS. No ORM or component library.

## Project references

- [`docs/product/design-doc.md`](docs/product/design-doc.md) is the canonical source for product requirements and decisions.
- [`docs/progress/mvp-implementation-checklist.md`](docs/progress/mvp-implementation-checklist.md) tracks implementation and release readiness. Checked items require evidence in the repository or verified external state; the checklist does not add product requirements.

## Local setup

Use Node.js 24 (matching CI) and npm.

```sh
npm ci
```

Create an ignored `.env.local` with these variable names:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
PARTICIPATION_POINTS_PER_HOUR=1
```

Use your Supabase project's URL and **publishable** key. The older client-safe anonymous key also works. Never use a service-role/secret key here. No private backend credential is needed. Do not commit `.env.local` or credentials.

Apply the migrations below to a development Supabase project, then:

```sh
npm run dev
```

Open http://localhost:3000. All schedule entry and displayed dates use UTC, explicitly labeled in the forms. Event types are selected from database records; existing custom types remain available. Upcoming/happening/past status is derived from timestamps; cancellation is explicit. Refresh a page to observe a time transition; there is no live timer.

## Database and migrations

Thirteen application tables: `officers`, `positions`, `branches`, `officer_branches`, `events`, `event_types`, `event_branches`, `event_officers`, `point_transactions`, `officer_warnings`, `warning_approvals`, `application_config`, and `audit_logs`. Supabase manages `auth.users` separately.

Migrations in `supabase/migrations` capture the original schema, migrate text positions to `position_id`, seed the 15 design-doc positions and four branches (intro, social, icpc, general), and add events, points, and computed views. Existing legacy position names are preserved as catalog entries rather than guessed replacements. `can_manage_branch_events` defaults to false; only ICPC Lead, Intro Lead, and Social Media Lead are seeded true. Authorization using that capability is deferred.

Foreign keys preserve references; composite primary keys prevent duplicate memberships/signups; constraints enforce classification/status, unique provided UTEP/personal emails and position/branch names, nonblank names/reasons, finite numeric points, and end after start. Deactivation/cancellation retain history. `created_by`, `removed_by`, warning approvers, and audit actors now reference `auth.users`. Nullable actors support system operations without fake users. Officers have a nullable unique auth link and default to the `officer` application role; login/linking and role authorization are deferred.

For a **new development project**, use the official Supabase CLI:

```sh
npx supabase init
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The original POC migrations were applied to the connected CappyHub development project. PR 1 adds a forward migration verified locally; this PR does **not** apply it to a hosted project. Deploy the migration and matching application code together. Do not replay old migrations manually against that database. The first migration also supports a fresh empty public schema. Review migration history with `npx supabase migration list` before applying to an existing project with other changes.

For a new change, create a migration with `npx supabase migration new descriptive_name`, write the SQL, review it, and apply through the usual Supabase workflow. Regenerate the schema types after applying:

```sh
npm run db:types
npm run db:types:check
```

The pinned CLI generates public-schema types from the local migrated database; CI checks for drift. Auth-schema foreign keys are enforced in PostgreSQL even though public-only type generation omits relationships to that private schema. Local CLI metadata is ignored.

PR 1 converts `events.type` to a required `event_type_id`, seeding the six documented types and preserving custom historical values. Case/outer-whitespace variants share a catalog record. It preserves IDs and relationships and aborts on unknown non-null legacy point actors instead of deleting attribution. Officer saves reject empty branch selections transactionally; direct prototype table writes still require the later authorization hardening.

`application_config` has one seeded record (`id = 1`), a positive finite participation rate of **1**, and a nonnegative finite flyer amount of **0**. Zero is a neutral migration placeholder because no initial flyer business value is specified. Admin configuration, rate snapshotting, and flyer processing are deferred. Existing page-load processing still uses the prototype environment setting until the processing PR.

For local database verification, start Docker and run:

```sh
npm run db:start
npm test
npm run test:db:upgrade
npm run db:types:check
npx supabase db lint --local --schema public --fail-on error
```

`db:start` runs the database services needed by the tests. `npm test` uses Vitest to execute real PostgreSQL pgTAP assertions in a rolled-back transaction; missing local database access fails the test. `test:db:upgrade` **resets the local Cappy Hub database**, seeds synthetic POC history, applies the new migration, checks preservation, and resets to a fresh latest schema in cleanup. It has no hosted/URL option. Use this workflow only with disposable local data. `npm run db:reset` is also destructive to local development data. Stop the test stack with `npx supabase stop --no-backup`.

See [PR 1 schema verification](docs/progress/pr1-schema-verification.md) for the integrity rules, migration choices, and remaining work.

## Automatic participation points

The centralized configuration is `PARTICIPATION_POINTS_PER_HOUR`, read in `lib/participation.ts`; the reversible prototype default is **1 point per hour**. It must be positive and finite. Restart the app after changing it. A changed rate affects only awards not yet recorded, including old unprocessed events; it does not rewrite existing history. The club's actual rate still needs to be configured.

When Dashboard, Events, Officers, Points, or their relevant detail pages load on the server, `processCompletedEvents()` calls the database function `process_completed_events`. It inserts awards for signed-up officers on noncancelled events whose scheduled end has passed:

```text
points = (ends_at - starts_at in seconds) / 3600 × configured rate
```

A 90-minute event at the default rate awards 1.5 points. PostgreSQL numeric supports fractions; display rounds to at most six decimal places. A partial unique index enforces one `participation` award per officer/event, and processing uses `ON CONFLICT DO NOTHING`. Repeated/concurrent calls cannot duplicate awards. Other manual transactions for the same event remain allowed.

No scheduled job runs while the app is idle. The next relevant server page load catches up ended events. Reload an already-open page after an event ends. Next.js may prefetch server pages, which can also trigger processing. A production MVP needs authenticated trusted processing at scheduled times and a decision about rate changes over time.

Officer totals use the `officer_point_totals` query view over active transactions (`removed_at IS NULL`). The dashboard uses a query view over records for January–June or July–December in UTC, based on transaction creation time, including negative corrections. History is limited to the latest 50 transactions on Points, 100 on a detail page, and 10 on Dashboard; totals include all active records. Normal history queries also exclude removed rows. Automatic-award uniqueness includes removed rows, so a voided participation or flyer award cannot be regenerated. Lists are intended for a small prototype; pagination/search is deferred.

Corrections add a new manual or correction transaction; original transactions remain unchanged. Signups close at the scheduled end or cancellation. Upcoming-event editing prevents changing a completed schedule through the app. There is no early-completion UI or attendance verification in this pass.

## Temporary development security

**TEMPORARY DEVELOPMENT POLICIES — not production authorization.** RLS is enabled on all thirteen tables. New warning, approval, configuration, and audit tables have no anonymous/authenticated access yet. Event types permit prototype read access only. Existing prototype policies target the anonymous role used by the publishable key:

- Positions and branches: read only.
- Officers: read, insert, update; officer branches: read, insert, delete.
- Events: read, insert, update while the existing scheduled end is still future.
- Event branches: read, insert, delete.
- Event officers: read; insert/delete only for noncancelled events before their scheduled end.
- Point transactions: read and insert existing POC award types with `created_by` null; no update/delete permissions or anonymous flyer/removal writes.
- Role/auth-link, event snapshot/file/flyer, and point removal columns are excluded from prototype write grants.
- Computed views use `security_invoker`; database functions run as the caller with an empty search path and explicit execute grants.

These grants allow unauthenticated users with the project URL/key to access prototype data and perform the allowed writes. They support workflow development, **not user identity, admin restrictions, or trusted participation-award configuration**. The server action's configured rate is not a production security boundary: the anonymous RPC remains callable during development. Use development data and replace these policies, grants, and processing access before production. Do not work around RLS with a service-role key in the browser.

## Quality checks

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

`npm run format` fixes formatting. CI runs all five checks, local database migration replay, populated-upgrade preservation tests, generated-type verification, and SQL function lint after `npm ci` on pull requests into `main` or `mvp` and pushes to either branch. It uses Node.js 24 from `.nvmrc`, read-only repository permissions, and fake public Supabase values; database queries run at request time rather than build time. No privileged credentials are needed to compile.

`npm test` runs Vitest once with the existing `@/` alias; its database test invokes pgTAP against local Supabase. There is no empty-suite allowance or mock of PostgreSQL constraints. Application behavior tests can still be added as `*.test.ts` or `*.spec.ts` when relevant.

## Try the core flow

1. Create an officer with a seeded position and two branches.
2. Create an event with two branches. To observe completion quickly, set its start in the past and end a minute or two in the future (UTC).
3. Add the officer on the event detail page before it ends.
4. After the scheduled end, reload Events/Points or open the officer profile. Verify one participation award equals scheduled hours × rate.
5. Reload repeatedly. There should still be one participation award.
6. Add +2.25 manual points and a -0.75 correction. Verify total, officer history, event history when attached, Points, and Dashboard.
7. Check an unknown officer/event ID for the not-found page.

Validation data created during implementation is explicitly named “Prototype …” and remains in the development database for inspection.

## Deferred to MVP

Authentication and account linking; admin/officer/branch-lead permissions and final RLS; trusted scheduled processing; early completion; warnings/approvals; System Log/full auditing; award removal with audit history; flyer workflow; recurring events; Google Calendar/Drive/Discord integrations; spreadsheet imports; advanced filtering/search; production error UX and deployment hardening. The actor foreign keys and stored lead capabilities are implemented; identity-aware enforcement remains deferred. No production-ready security is claimed.

## Git & GitHub Workflow

`main` is the stable integration branch. Do not develop directly on it.

### Start new work

Sync `main` before creating a short-lived branch:

```sh
git switch main
git fetch --prune
git pull
git switch -c feat/event-signups
```

`git fetch --prune` updates remote-tracking references and removes references to remote branches that have been deleted. Use it to keep your local view of GitHub current, especially after merged branches are deleted; it does not delete your local branches.

Use lowercase kebab-case branch names with one of these prefixes:

- `feat/...` — features, e.g. `feat/event-signups`
- `fix/...` — bug fixes
- `chore/...` — maintenance
- `docs/...` — documentation
- `refactor/...` — code restructuring

### Commits and pull requests

Keep commits focused and meaningful. Use conventional-style commit messages: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, `refactor: ...`, or `ci: ...`.

Push your branch and open a PR into `main`:

```sh
git push -u origin feat/event-signups
```

PR titles use the same conventional style, e.g. `feat: add event signups`. PR descriptions should contain:

- **Summary** — what the PR accomplishes.
- **Changes** — the important changes.
- **Testing** — checks and relevant manual verification actually performed.
- **Notes** — only when useful, such as limitations or implementation decisions.

Before merging, review the diff and run the repository's CI checks:

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Wait for required GitHub checks to pass. Do not merge while required checks are failing.

### Merge and clean up

Use **Squash and Merge** for completed PRs. The squash commit title should be a clean conventional-style summary, normally matching the PR title. Delete the remote branch after merging, then synchronize locally:

```sh
git switch main
git fetch --prune
git pull
```

Never force-push or rewrite shared `main` history. Never commit `.env.local`, credentials, or secrets.
