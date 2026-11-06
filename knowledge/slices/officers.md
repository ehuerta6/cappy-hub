# Officer directory and lifecycle

**Status:** Shipped in repository `main` at [`2202dee`](https://github.com/ehuerta6/cappy-hub/tree/2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7); production deployment is not established by repository evidence.

**Actors:** Admins manage Officer profiles and lifecycle; Officers use their own profile and authorized self-service workflows; authenticated users resolve to active Officer records.

The Officer is the durable identity around which access and club records connect. Admins manage the profile, explicit application role, status, Position, and Branch memberships; Officers can be found through the directory and their profile keeps associated Event participation, warnings, Points, and history in context. Access semantics are in [Identity and access](identity-access.md), while profile behavior and canonical rules are in [the product Officer spec](../../docs/product/officers.md).

Deactivation is a lifecycle transition, not deletion: it retains the Officer identity and historical relationships, but the inactive person cannot enter protected workflows or be selected for new eligible assignments and awards. Reactivation restores eligibility without implicitly changing role, Position, or Branch memberships. This distinction matters when reviewing old signups, Task assignments, Warning records, Point history, and actor attribution; do not treat historical links as current eligibility. Additional personal/profile fields are deferred under [Issue #140](https://github.com/ehuerta6/cappy-hub/issues/140); its former field proposal is not an active commitment without a new maintainer decision.

Implementation evidence: [directory](../../app/%28protected%29/officers/page.tsx), [profile route](../../app/%28protected%29/officers/%5Bid%5D/page.tsx), [Officer actions](../../app/%28protected%29/officers/actions.ts), [current Officer resolution](../../lib/current-officer.ts), and [directory pagination tests](../../tests/officers-directory-pagination.test.tsx). The authorization and trusted-boundary contract remains canonical in [authorization.md](../../docs/product/authorization.md).

**Aliases:** Officer profile, directory, deactivate, reactivate, active/inactive status, associated records, role assignment.

**Slice boundary:** The durable Officer record and directory/profile deserve a separate workflow context from [identity and access](identity-access.md), which owns cross-domain account and authorization rules.
