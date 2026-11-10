# Lead management scope for Events

**Actor:** a Lead. **Entry:** an Event action available in the Events workflow.

1. The Lead's trusted authorization context is resolved from the active Officer record and system Position code.
2. An active Lead may create and edit Events across all Branches, including global Events with no Branches.
3. The server/database mutation enforces the same Event scope; hiding an action in the interface is not the authorization boundary.
4. Event executives retain global Event management, and Admins retain application-wide administration within product boundaries.

**Important boundaries:** a display name, Event signup, or Task assignment does not grant additional permissions. Task management remains limited to a Lead's Branches.

**Sources:** [authorization contract](../product/authorization.md), [Event contract](../product/events.md), [design screen guidance](../design/screens.md), `lib/authorization.ts`, `app/(protected)/events/actions.ts`, migration `20260928132955_authorization_foundation.sql`.
