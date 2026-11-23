---
name: cappy-google-calendar-review
description: Review Cappy Hub Google Calendar mirror, recovery, credential, test, or documentation changes against the cross-system lifecycle and privacy contract.
---

# Cappy Google Calendar review

Use this project-specific review skill when a change touches the Google Calendar Event mirror, persisted sync failures or manual retry, recurrence synchronization, credentials, Calendar API tests, or the integration guide. For a pull request, use it alongside `review-pr`; when database behavior changes, also use `database-change` and `cappy-database-reviewer`.

## Review process

1. Read [`docs/google-calendar.md`](../../../docs/google-calendar.md), the relevant Event, authorization, and recurrence contracts, and the [Event Delete/Restore journey](../../../docs/user-journeys/event-delete-restore.md). Inspect the complete diff, related server actions, `lib/google-calendar-*`, migrations, tests, and callers. Verify the guide against current code; do not assume either one is current when they conflict.
2. Check the Cappy Hub to Calendar boundary:
   - Cappy Hub remains canonical, and Calendar writes happen only after the Cappy Hub mutation commits.
   - Recurrence changes synchronize only the intended Event occurrence IDs and preserve each occurrence's lifecycle.
   - The external payload stays within the documented safe fields; do not add attendees, invitations, roster, points, or private/audit data without an approved product change.
   - Stable IDs and conditional ETag writes preserve identity and avoid overwriting newer Calendar state or creating duplicates.
3. Check failure and recovery across the UI, server action, and database:
   - A Calendar failure does not undo the committed Cappy Hub Event change.
   - Persisted failures remain scoped to the affected occurrence and are visible only to authorized Event managers.
   - Manual retry is authorized for the Event's manager scope and writable period, uses current canonical Event state (including deleted status), and retries only the selected occurrence. Success clears the failure; failure remains visible.
   - The results RPC confirms that it applied the expected canonical snapshot before the caller reports Calendar is up to date. Review the race where an Event changes after the final canonical read but before the RPC locks and checks its row; require a focused test for that interleaving. If this gap exists, report it as a finding rather than expanding an unrelated documentation or skills change into a runtime fix.
   - Do not describe this as an automatic queue or scheduled retry; later normal Event operations also attempt synchronization.
4. Check credentials and external side effects. Production writes use the approved server-side identity. Local real-API tests remain opt-in against `CAPPYHUB TEST`; Preview and CI use mocks and do not contact the production Calendar. Never run `npm run calendar:publish-test` or write to a real Calendar without explicit authorization for the test calendar.
5. Verify the focused unit, action, and database tests relevant to the change. For migrations, use the repository's safe local database workflow and applicable upgrade/type checks. Report exact checks run, remaining gaps, and any mismatch between documentation and implementation.

## Findings

Report only concrete defects. For each finding, include severity, file or database object, the failure or privacy/authorization impact, and a focused recommendation. Keep external-service limitations and checks not run explicit. This review is internal feedback, not formal GitHub approval or merge authorization.
