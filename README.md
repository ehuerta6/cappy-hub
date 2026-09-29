# Cappy Hub

Cappy Hub is an internal administrative application for the Coding Interview Club. This initial functional proof of concept connects Officers → Events → Signups → Scheduled completion → Participation points → History/totals → Dashboard.

## Current scope

- Officers: create, list, view, edit, deactivate/reactivate; one controlled position, optional academic classification, at least one contact email, and zero or more branches.
- Events: create, list, view, edit upcoming events, cancel before the scheduled end, zero or more branches, add/remove active officers while signup is open.
- Points: automatic scheduled participation awards, positive/negative fractional manual transactions and corrections, officer totals calculated with SQL `SUM`.
- Connected profiles: officer events and point history; event participants and related transactions; private warning history for admins and the assigned officer.
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
```

Use your Supabase project's URL and **publishable** key. The older client-safe anonymous key also works. Never use a service-role/secret key here. No private backend credential is needed. Do not commit `.env.local` or credentials.

Apply the migrations below to a development Supabase project, then:

```sh
npm run dev
```

Open http://localhost:3000. Sign in with a Google account whose verified email matches an existing active officer. All schedule entry and displayed dates use UTC, explicitly labeled in the forms. Event types are selected from database records; existing custom types remain available. Upcoming/happening/past status is derived from timestamps; cancellation is explicit. Refresh a page to observe a time transition; there is no live timer.

## Google authentication setup

The application login flow is:

```text
Google → Supabase Auth → auth.users → officers.auth_user_id → active Cappy Hub officer
```

In Google Cloud, create a Web OAuth client and add the **Supabase Auth callback URL** shown in your Supabase project's Google provider settings as an authorized redirect URI. In Supabase Auth, enable Google and enter that client's ID and secret. Set the Supabase site URL and allow both `http://localhost:3000/auth/callback` and the deployed application's `https://YOUR_DOMAIN/auth/callback` as application redirect URLs. Keep the Google secret in the Supabase provider configuration, never in this repository. Use the same Supabase project URL and publishable key in `.env.local` and in deployment environment variables. The app derives the callback origin from the browser, so no production hostname is hardcoded.

The officer directory is the allowlist. First login matches the verified Google email to either officer email field, ignoring case, and atomically links exactly one active, unlinked officer. No officer row is created. Later requests use `auth_user_id`, even if the officer's contact email changes. An inactive officer loses application access immediately while their auth link and history remain. Sign out removes the Supabase session. Unknown, inactive, and conflicting accounts see a generic access-denied page.

Repository code and local database tests do not configure the external Google client or the Supabase provider. Until those settings are applied and a real approved/unapproved login is checked, live Google sign-in is unverified. The local `db:start` test stack excludes Auth and API services and verifies the PostgreSQL identity rules only.

**Current database boundary:** protected pages and writes use the cookie-backed authenticated Supabase client. PostgreSQL grants and RLS allow application reads only to a linked active officer. Sensitive writes require the checked RPCs; a publishable key alone grants no application data access. Live Google provider setup and end-to-end sign-in verification are still pending.

## Database and migrations

Thirteen application tables: `officers`, `positions`, `branches`, `officer_branches`, `events`, `event_types`, `event_branches`, `event_officers`, `point_transactions`, `officer_warnings`, `warning_approvals`, `application_config`, and `audit_logs`. Supabase manages `auth.users` separately.

Migrations in `supabase/migrations` capture the original schema and then reconcile PR 1 to the current design. The final position catalog has six generic positions, and the controlled branches are general, intro, icpc, social, and outreach. Legacy detailed titles map to a generic position plus the corresponding branch memberships without changing officer IDs. Lead authorization follows the generic Lead position and shared event branches.

Foreign keys preserve references; composite primary keys prevent duplicate memberships/signups; constraints require at least one officer email, enforce case-insensitive uniqueness across both contact fields, validate classification/status and nonblank names/reasons, and require timed events to end after they start on the same America/Denver calendar day. Deactivation/cancellation retain history. `created_by`, `removed_by`, warning approvers, and audit actors reference `auth.users`. Officers have a nullable unique auth link and default to the `officer` application role; trusted role assignment is admin-protected.

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

PR 1 converts `events.type` to a required `event_type_id`, preserving custom historical values. The corrective migration permits zero officer or event branches; zero event branches means global. Save RPCs still replace associations transactionally. Direct prototype table writes still require later authorization hardening.

`application_config` has one seeded record (`id = 1`) with a positive finite participation rate of **1**. Admin configuration and trusted rate snapshotting are deferred. Existing page-load processing still uses the prototype environment setting until the processing PR.

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

## Authorization foundation (PR 3)

An authenticated user is linked to an active officer. The officer's `application_role` grants global administration; the `Lead` position plus a shared `officer_branches`/`event_branches` membership grants management of a branch-associated event. Position and application role remain independent.

```text
Admin                     → global officer, event, signup, and manual-point management
Lead + shared event branch → manage that event and its signups
Officer                   → manage their own open signups
Global event (0 branches) → admin-managed only
```

Server Actions use the cookie-backed Supabase client for writes. Each trusted database mutation resolves the actor from `auth.uid()` and checks permission again. A Lead must already manage an event before replacing its branches, and the resulting branches must still overlap. Generic officer editing cannot set `application_role`; the dedicated `set_officer_application_role` RPC blocks self-demotion and loss of the last active admin. Deactivating an officer transactionally removes their signups for events whose scheduled start is still in the future; past participation and the Auth link remain.

**First admin bootstrap:** After a real officer signs in and links their account, a database administrator must inspect that active officer's `id` and `auth_user_id`, then manually set `application_role = 'admin'` for that single verified row in the Supabase SQL editor. Check that exactly one row was updated. Do not place a person's email or UUID in a migration. Thereafter, admins assign or remove admin access on another officer's profile. The form uses the protected role-management RPC and cannot demote the current admin or the last active admin.

Admins manage positions and branches from Officers → Manage positions and branches, and event types from Events → Manage event types. These are database records, so the officer and event forms load new or renamed values without code changes. The six baseline positions are required and cannot be renamed or deleted; this preserves the canonical `Lead` name used by branch authorization. Other positions, branches, and event types can be created or renamed. Deletion is allowed only for unused records, preserving officer memberships and event history. Each successful change is written to System Log in the same database transaction. Catalog RPCs recheck active-admin status; ordinary clients still have no direct catalog write grants.

The prototype `process_completed_events` function has been removed. Pages never trigger participation processing. A private PostgreSQL function runs through Supabase Cron about once per minute; ordinary application users cannot invoke it.

## Database access and RLS (PR 4)

The Data API applies two gates before returning application rows:

```text
Browser / Data API → PostgreSQL grant → RLS → linked active officer
```

`anon` has no table, view, sequence, or public-function access to application data. A signed-in account without an active linked officer also sees no application rows. Approved officers may read the shared directory, events, signups, point history, catalogs, and rate configuration. Warning rows are separate: admins see all; the assigned officer sees only their own approved warnings; a required approver sees only a warning awaiting their decision and their own pending approval row. Admins can read all approval rows and the System Log. Direct warning writes remain closed to client roles.

Sensitive raw table writes are denied to every client role, including admins. Officer/branch edits, event/branch edits, signup changes, role assignment, and manual points must use the protected RPCs:

```text
Client → trusted RPC → auth.uid() → private authorization check → transactional mutation
```

This prevents a direct table write from skipping the RPC's branch checks, signup closure rules, role invariants, or deactivation cleanup. The exposed views use `security_invoker`; the dashboard view also returns no row to an unapproved account. Prototype anonymous policies and per-column grants are removed. Defaults for objects created by the migration role are closed; Supabase-managed roles have separate defaults, so every future public object still needs an explicit grant and RLS review.

The local test suite exercises direct SELECT/INSERT/UPDATE/DELETE and RPC behavior as `anon`, unlinked, inactive, officer, Lead, and admin. It does not configure the external Google provider or deploy the migration to a hosted Supabase project.

## Audit trail and System Log (PR 5)

Meaningful mutations use one private audit writer in the same PostgreSQL transaction as their business change:

```text
Trusted RPC → authorization and validation → data mutation → private audit write → commit
```

The writer derives the human actor from `auth.uid()` and stores action, entity reference, time, and concise JSON details. A failed audit insert rolls back the business change. Ordinary clients cannot call the writer or insert, edit, or delete audit rows. A future trusted system operation may write with `actor_id = NULL` without inventing a user.

Current coverage includes officer create/edit/deactivate/reactivate, role changes, first auth linking, event create/edit/cancel, self and manager signup changes, manual points, corrections, position/branch/event-type changes, participation-rate changes, logical award removal, scheduled awards, and warning creation/decisions/deletion. Repeated saves or signup requests with no resulting change do not create another audit event. The early-completion workflow remains future work.

Admins can open `/system-log` from their navigation. The page uses the authenticated client and the admin-only audit RLS policy, resolves actor names from the officer directory where possible, and pages newest-first through older history. The page is read-only.

## Administrative points (PR 7)

`application_config.participation_points_per_hour` is the current rate. Admins change it on the Points page through a protected, audited RPC; ordinary users may see the current value. Historical transactions and existing event rate snapshots are never recalculated. The trusted scheduled processor reads this configuration and snapshots it when a timed event finishes.

Admins can create signed manual transactions and explicit corrections. A correction is a new row and leaves the original unchanged. An incorrect participation award can be logically removed: the row retains its original amount and reason, receives `removed_at` and the authenticated `removed_by`, and remains in the audit trail. Active totals and ordinary history exclude it. The unique participation-award index still includes removed rows, preventing regeneration.

The Points page searches officer names, reasons, and event names in the database before pagination. It filters by type, officer, event, and, for admins, removal status. Older history is reachable through page links, including from officer profiles and event details. Dashboard half-year totals use January–June and July–December boundaries in `America/Denver`.

## Automatic participation (PR 8)

Supabase Cron runs `private.process_finished_events()` once per minute inside PostgreSQL. It considers a non-cancelled timed event finished at its scheduled end or when its stored status becomes `past` through an authorized early-completion workflow. Processing locks the event, snapshots the current database rate, awards each signup the **full scheduled duration × rate**, and writes System Log entries. A zero-signup event still gets a rate snapshot and an event-level audit entry. The event detail shows the rate used.

The rate snapshot marks the event processed. Later runs skip it, and the participation uniqueness index includes logically removed rows, so an admin-removed award never reappears. Overlapping Cron calls skip event rows locked by another worker. A failed invocation rolls back its changes and appears in `cron.job_run_details`; the next run can retry. The migration registers one named Cron job, but this repository does not verify that a hosted Supabase project has applied or run it. Apply migrations and inspect the hosted Cron job and run history before relying on production awards.

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

## Try the current flow

1. Have a database administrator bootstrap one verified active officer as admin, as described above.
2. Sign in as that admin, create or edit officers, and create global or branch events.
3. Sign in as an ordinary officer and manage only your own signup while the event is open.
4. Sign in as a Lead with a branch membership and manage a matching branch event and its signups. An unrelated or global event stays outside Lead scope.
5. Use the admin Points form for a manual transaction or correction. Once the Cron migration is applied to the target database, finished timed events receive participation awards automatically.

## Warning workflow

An admin creates a warning on an officer profile with a required reason. The database starts it as `pending` and stores one approval row for each current President and Vice President with an active, linked Auth account, excluding the warned officer. Creation fails if a required leader is inactive or unlinked, or if no eligible approvers remain. The warning's target, reason, creation time, and approver list do not change through normal application workflows. Later position changes do not transfer a vote; an approver who becomes inactive afterward cannot sign in to decide it, so exceptional roster problems require administrative handling outside the normal MVP workflow.

The Officers page shows a leader only the warnings awaiting **their** decision. Each leader approves or rejects once using their own account. One rejection closes the warning as rejected; all required approvals make it approved; otherwise it stays pending. Only approved warnings appear on the warned officer's profile and count toward its total. At three approved warnings, the profile displays an **Admin Review** flag; the officer stays active until an admin separately decides to deactivate them.

Admins see all warning states, approval progress, and status filters on the officer profile. They may delete a warning, which also removes its approval rows. Creation, each decision, and deletion are recorded in the System Log in the same transaction. The deletion entry contains the reason, status, created time, and every snapshotted approver and decision so the history remains understandable after the source rows are gone. No warning edit or vote reassignment workflow is provided.

## Deferred to MVP

Live authentication-provider verification; deployment of the migrations and Cron job to the hosted project; early-completion UI; audit coverage for future workflows; Google Calendar/Drive/Discord integrations; spreadsheet imports; production error UX and deployment hardening. Untimed events/tasks await product feedback. Trusted mutation authorization, direct database access, automatic processing, warning workflows, and current audit operations are verified locally. Live provider setup and deployment are still pending.

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
