# Identity and access

**Status:** Shipped in repository `main` at [`2202dee`](https://github.com/ehuerta6/cappy-hub/tree/2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7); this evidence does not establish production deployment.

**Actors:** Authenticated users enter through their linked active Officer identity; Admins manage access roles; trusted server/database checks enforce sensitive actions.

An authenticated user enters the protected app through a linked, active Officer record. Think of identity, lifecycle status, application role, Position, and Branch membership as separate facts: the Officer record identifies the person, active status gates access, the explicit role grants Admin access, Position describes club role, and Branches scope applicable work. A title or relationship must never be treated as an implicit permission grant.

Officer deactivation preserves identity and historical links while removing eligibility for protected access and new active-workflow assignments. This connects access decisions to the Officer lifecycle and to Event, Task, Point, Warning, and audit history; see [Officers](officers.md). Sensitive actions are authorized at trusted server/database boundaries with RLS, so a hidden UI control is not an enforcement boundary.

For the full role and scope contract, read [Authorization and trusted boundaries](../../docs/product/authorization.md). Implementation evidence: [current Officer resolution](../../lib/current-officer.ts), [authorization helpers](../../lib/authorization.ts), [authorization migration](../../supabase/migrations/20260928132955_authorization_foundation.sql), [final RLS policies](../../supabase/migrations/20260928140107_final_rls.sql), and [authorization tests](../../tests/authorization.test.ts).

**Aliases:** login identity, active Officer, account linking, Admin role, Position codes, Branch scope, trusted authorization, RLS.
