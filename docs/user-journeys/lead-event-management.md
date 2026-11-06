# Lead management scope for Events

**Actor:** a Lead. **Entry:** an Event action available in the Events workflow.

1. The Lead's trusted authorization context is resolved from the active Officer record and system Position code.
2. A Lead may manage a branch-associated Event only when the Lead and Event share at least one Branch. An Event with no Branches is global and outside Lead scope.
3. The server/database mutation enforces the same scope; hiding an action in the interface is not the authorization boundary.
4. Event executives have the accepted global Event management scope, and Admins have application-wide administration within product boundaries.

**Important boundaries:** a display name, Event signup, or Task assignment does not grant additional permissions. Task management follows its own Branch rule.

**Sources:** [authorization contract](../product/authorization.md), [Event contract](../product/events.md), [design screen guidance](../design/screens.md), `lib/authorization.ts`, `app/(protected)/events/actions.ts`, migration `20260928132955_authorization_foundation.sql`.
