# PR 1 — final MVP schema

This change establishes the thirteen-table model in migrations. It does not deploy the migration to the hosted project or claim production authorization. The Design Doc remains the product source of truth.

## Migration choices

- `events.type` becomes a required `event_type_id`: seed the six documented types, add custom historical names, match case-insensitively after trimming outer spaces, populate every event, require the FK, then drop the text column. Referenced types cannot be deleted. IDs and related records do not change.
- Officers default to application role `officer`, with no invented admins or auth links. A unique nullable auth FK allows pre-login officers and prevents one account linking to multiple officers.
- The existing position capability is updated for exactly ICPC Lead, Intro Lead, and Social Media Lead.
- New columns store future rate snapshots, URLs, flyer state/assignee, and point removal metadata. No actual-completion timestamp is added.
- A fixed primary key of `1` permits at most one configuration record, seeded at participation rate `1` and flyer amount `0`. The former preserves the POC default; the latter is a neutral placeholder, not a prescribed club award. Participation rates must be positive and finite; flyer amounts may be zero or positive and must be finite. Both support fractions. No client may delete this row. A database owner can still remove it; “exactly one” is maintained by seeding and the future trusted config update operation, not a deletion trigger.
- Warning approvals retain `President` or `Vice President` role context and one record per warning/auth account. Deleting a warning can delete its dependent votes; audit records are independent and retain supplied snapshots.
- Actor FKs use `auth.users`. If pre-existing non-null `created_by` values do not reference real accounts, migration stops for explicit data reconciliation instead of erasing attribution. Null system/prototype actors remain null.
- Audit `entity_id` is text so it can describe numeric or composite keys without an FK to a mutable/deletable business entity. `details` is JSONB.
- The officer-save RPC rejects empty/null branch selections before writing. Foreign-key failures roll back the officer and all membership replacements together. Direct POC table writes remain possible until PR 3 restricts them; this is a save-path guarantee, not a cross-table CHECK or claim of final authorization.
- Participation/flyer uniqueness includes removed rows. Totals and ordinary application history filter `removed_at IS NULL`. The existing UTC half-year behavior remains; the coordinated America/Denver change is deferred.

## Engineering concepts

Foreign keys prevent references to missing records. CHECK constraints reject invalid values within a row. Composite primary keys model many-to-many membership/signup pairs without duplicates. Partial unique indexes limit participation to one award per officer/event and flyers to one per event, including voided awards.

Atomic save functions execute the record update and relationship replacement in one transaction, so failure leaves the previous state intact. A forward migration transforms existing rows instead of replacing history. Point totals remain derived queries; logical removal changes which transactions count without losing the original award or allowing automatic regeneration.

## Database test coverage

The pgTAP assertions execute inside PostgreSQL, not mocks:

- Officer saves reject empty and null branches; rejected edits preserve names and memberships. An invalid branch fails after attempted mutation and proves both record and relationship rollback.
- Officer/branch, event/branch, and officer/event duplicate pairs are rejected.
- Equal/reversed event times, invalid application roles, invalid/missing event types, and deletion of referenced types are rejected. Type-name uniqueness handles case and outer whitespace.
- Auth links require real accounts and cannot link the same account to two officers. New officers remain unprivileged. Exactly the three documented lead positions have the stored capability.
- Automatic participation and flyer duplicates fail; flyers cannot bypass per-event uniqueness by changing the officer. Both automatic award types require events, and removal never frees their unique keys.
- Existing POC processing executes without regenerating removed participation awards or rewriting their amounts when the supplied rate changes.
- Signed fractional corrections affect totals, removed awards do not, and zero-point officers remain visible. Dashboard totals exclude removed awards and transactions outside the current half-year.
- Point creation/removal actor FKs reject unknown accounts.
- Warnings begin pending, require a reason, accept only valid decisions, and reject duplicate approvers even when role context changes. An audit snapshot survives warning deletion.
- Configuration rejects duplicate/alternate singleton keys and non-finite values while accepting fractions.
- Existing anonymous POC officer/event create/edit, signup, and processing still work. Newly added roles, snapshots, flyer awards, warnings, and audit access are not exposed through those prototype permissions. These are compatibility checks, not a final authorization test suite.

The populated-upgrade fixture compares all existing officer/event/point fields, IDs, timestamps, actor values, and relationship sets before and after migration. It includes seeded and custom type variants, a negative correction, a nullable actor, and a real auth actor. It verifies the final application table set has thirteen members. Cleanup replays every migration against a fresh local database.

## Verification

Executed locally:

- `npm run db:start` — passed, including fresh migration replay on local Supabase PostgreSQL 17.
- `npm test` — real PostgreSQL integrity/compatibility assertions passed.
- `npm run test:db:upgrade` — populated POC preservation and subsequent fresh replay passed.
- `npm run db:types` — regenerated types from local migrated schema.
- `npm run db:types:check` — generated types match the replayed schema.
- `npx supabase db lint --local --schema public --fail-on error` — passed with no schema errors.
- `npx supabase db advisors --local --type all --level warn --fail-on none` — reports only the seven existing permissive POC write policies. Those are deliberately deferred to PR 3; this is not a production security approval.
- `npm run lint`, `npm run format:check`, `npm run typecheck` — passed.
- `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_placeholder npm run build` — blocked locally by Turbopack's temporary-port sandbox restriction (`Operation not permitted`), as in PR 0. A successful GitHub CI production build is required before merge.

[GitHub CI on Node 24](https://github.com/ehuerta6/cappy-hub/actions/runs/36349607898) passed all quality gates, the production build, database integrity tests, populated-upgrade/fresh-replay checks, generated-type drift verification, and SQL function lint. Hosted migration application and real-data reconciliation are not verified by local synthetic fixtures.

## Deferred work

Google login/linking, identity-aware authorization and final RLS, cron processing, configuration-driven snapshots, warning voting workflows, audit writers/System Log UI, logical removal actions, flyer awarding, recurrence, event-type administration, and America/Denver UI/calendar boundaries remain future PRs. Existing page-load processing still takes the prototype environment rate. New workflow tables have RLS enabled and no client grants; no final role policies are introduced.
