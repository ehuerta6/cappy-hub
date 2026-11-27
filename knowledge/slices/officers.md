# Officer directory and lifecycle

**Status:** Shipped in repository `main` at [`2202dee`](https://github.com/ehuerta6/cappy-hub/tree/2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7); selected-period Activity view, profile metrics, UTEP email copy, and CSV exports implemented on `feat/478-csv-exports` (`ab1e0fe`); production deployment is not established by repository evidence.

**Actors:** Admins manage Officer profiles, lifecycle, and directory CSV exports; all active Officers view the directory, selected-period Activity comparison, and Officer profiles; authenticated users resolve to active Officer records.

The Officer is the durable identity around which access and club records connect. Admins manage the profile, explicit application role, status, Position, and Branch memberships; Officers can be found through the directory and their profile keeps associated Event participation, Task assignments, warnings, Points, and history in context. Access semantics are in [Identity and access](identity-access.md), while profile behavior and canonical rules are in [the product Officer spec](../../docs/product/officers.md).

The selected-period **Activity** view (`/officers?view=activity`) and matching profile cards read directly from [Tasks](tasks.md) and [Event participation](event-participation.md) without blending them into one score: due Task completion excludes upcoming, `No longer needed`, and removed Tasks (keeping pending-approval completions out of the numerator), while recorded Events combine `Volunteer` and `Attend` signups once per occurrence and remain explicitly labeled as recorded signups rather than verified attendance. Directory/activity email copy and CSV exports (`lib/csv.ts`, `/api/exports/officers`, `/api/exports/officers/activity`) include UTEP email only and exclude personal email addresses.

Deactivation is a lifecycle transition, not deletion: it retains the Officer identity and historical relationships, but the inactive person cannot enter protected workflows or be selected for new eligible assignments and awards. Reactivation restores eligibility without implicitly changing role, Position, or Branch memberships. This distinction matters when reviewing old signups, Task assignments, Warning records, Point history, and actor attribution; do not treat historical links as current eligibility.

Implementation evidence: [directory](../../app/%28protected%29/officers/page.tsx), [activity table](../../app/%28protected%29/officers/activity-table.tsx), [activity metrics](../../lib/officer-activity.ts), [profile route](../../app/%28protected%29/officers/%5Bid%5D/page.tsx), [Officer actions](../../app/%28protected%29/officers/actions.ts), [current Officer resolution](../../lib/current-officer.ts), [officer activity tests](../../tests/officer-activity.test.tsx), and [directory pagination tests](../../tests/officers-directory-pagination.test.tsx). The authorization and trusted-boundary contract remains canonical in [authorization.md](../../docs/product/authorization.md).

**Aliases:** Officer profile, directory, Officer activity, deactivate, reactivate, active/inactive status, associated records, role assignment.

**Slice boundary:** The durable Officer record and directory/profile deserve a separate workflow context from [identity and access](identity-access.md), which owns cross-domain account and authorization rules.
