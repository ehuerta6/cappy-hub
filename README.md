# Cappy Hub

Cappy Hub is an internal administrative application for the Coding Interview Club. This initial functional proof of concept connects Officers → Events → Signups → Scheduled completion → Participation points → History/totals → Dashboard.

## Current scope

- Officers: create, list, view, edit, deactivate/reactivate; one controlled position, academic classification, multiple branches.
- Events: create, list, view, edit upcoming events, cancel before the scheduled end, multiple branches, add/remove active officers while signup is open.
- Points: automatic scheduled participation awards, positive/negative fractional manual transactions and corrections, officer totals calculated with SQL `SUM`.
- Connected profiles: officer events and point history; event participants and related transactions.
- Dashboard: active officers, upcoming events, signed points this half-year, upcoming schedule and recent point activity. These are queries, not stored statistics.

Stack: Next.js App Router, React, TypeScript, Supabase/PostgreSQL, npm, existing Tailwind CSS. No ORM or component library.

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

Open http://localhost:3000. All schedule entry and displayed dates use UTC, explicitly labeled in the forms. Event types are free text with suggested initial values. Upcoming/happening/past status is derived from timestamps; cancellation is explicit. Refresh a page to observe a time transition; there is no live timer.

## Database and migrations

Eight primary tables: `officers`, `positions`, `branches`, `officer_branches`, `events`, `event_branches`, `event_officers`, `point_transactions`.

Migrations in `supabase/migrations` capture the original schema, migrate text positions to `position_id`, seed the 15 design-doc positions and four branches (intro, social, icpc, general), and add events, points, and computed views. Existing legacy position names are preserved as catalog entries rather than guessed replacements. `can_manage_branch_events` defaults to false and is unused until permissions are designed.

Foreign keys preserve references; composite primary keys prevent duplicate memberships/signups; constraints enforce classification/status, unique email/position/branch names, nonblank names/reasons, finite numeric points, and end after start. Deactivation/cancellation retain history. `created_by` is nullable and remains null without authentication; its final actor relationship is deferred.

For a **new development project**, use the official Supabase CLI:

```sh
npx supabase init
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The implementation migrations have already been applied to the connected CappyHub development project. Local filenames match Supabase's recorded versions. Do not replay them manually against that database. The first migration also supports a fresh empty public schema. Review migration history with `npx supabase migration list` before applying to an existing project with other changes.

For a new change, create a migration with `npx supabase migration new descriptive_name`, write the SQL, review it, and apply through the usual Supabase workflow. Regenerate the schema types after applying:

```sh
npx supabase gen types typescript --linked > lib/database.types.ts
npm run format
```

Supabase's connected plugin can also apply hosted migrations and generate types. Keep checked-in filenames aligned with the versions recorded remotely. Local CLI metadata is ignored.

## Automatic participation points

The centralized configuration is `PARTICIPATION_POINTS_PER_HOUR`, read in `lib/participation.ts`; the reversible prototype default is **1 point per hour**. It must be positive and finite. Restart the app after changing it. A changed rate affects only awards not yet recorded, including old unprocessed events; it does not rewrite existing history. The club's actual rate still needs to be configured.

When Dashboard, Events, Officers, Points, or their relevant detail pages load on the server, `processCompletedEvents()` calls the database function `process_completed_events`. It inserts awards for signed-up officers on noncancelled events whose scheduled end has passed:

```text
points = (ends_at - starts_at in seconds) / 3600 × configured rate
```

A 90-minute event at the default rate awards 1.5 points. PostgreSQL numeric supports fractions; display rounds to at most six decimal places. A partial unique index enforces one `participation` award per officer/event, and processing uses `ON CONFLICT DO NOTHING`. Repeated/concurrent calls cannot duplicate awards. Other manual transactions for the same event remain allowed.

No scheduled job runs while the app is idle. The next relevant server page load catches up ended events. Reload an already-open page after an event ends. Next.js may prefetch server pages, which can also trigger processing. A production MVP needs authenticated trusted processing at scheduled times and a decision about rate changes over time.

Officer totals use the `officer_point_totals` query view over all transactions. The dashboard uses a query view over records for January–June or July–December in UTC, based on transaction creation time, including negative corrections. History is limited to the latest 50 transactions on Points, 100 on a detail page, and 10 on Dashboard; totals include all records. Lists are intended for a small prototype; pagination/search is deferred.

Corrections add a new manual or correction transaction; original transactions remain unchanged. Signups close at the scheduled end or cancellation. Upcoming-event editing prevents changing a completed schedule through the app. There is no early-completion UI or attendance verification in this pass.

## Temporary development security

**TEMPORARY DEVELOPMENT POLICIES — not production authorization.** RLS is enabled on all eight tables. Policies target the anonymous role used by the publishable key:

- Positions and branches: read only.
- Officers: read, insert, update; officer branches: read, insert, delete.
- Events: read, insert, update while the existing scheduled end is still future.
- Event branches: read, insert, delete.
- Event officers: read; insert/delete only for noncancelled events before their scheduled end.
- Point transactions: read and insert with `created_by` null; no update/delete permissions.
- Computed views use `security_invoker`; database functions run as the caller with an empty search path and explicit execute grants.

These grants allow unauthenticated users with the project URL/key to access prototype data and perform the allowed writes. They support workflow development, **not user identity, admin restrictions, or trusted participation-award configuration**. The server action's configured rate is not a production security boundary: the anonymous RPC remains callable during development. Use development data and replace these policies, grants, and processing access before production. Do not work around RLS with a service-role key in the browser.

## Quality checks

```sh
npm run lint
npm run format:check
npm run typecheck
npm run build
```

`npm run format` fixes formatting. CI runs the four checks after `npm ci` on pull requests into main and pushes to main. It uses placeholder client-safe environment values; database queries run at request time rather than build time. There is no automated test framework in this prototype.

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

Authentication and account linking; admin/officer/branch-lead permissions and final RLS; trusted scheduled processing; early completion; warnings/approvals; System Log/full auditing; award removal with audit history; flyer workflow; recurring events; Google Calendar/Drive/Discord integrations; spreadsheet imports; advanced filtering/search; production error UX and deployment hardening. Club-title permissions and the actor foreign-key model remain design decisions. No production-ready security is claimed.

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
