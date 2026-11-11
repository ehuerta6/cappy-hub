# Lead management scope for Events

**Actor:** a Lead. **Entry:** an Event action available in the Events workflow.

1. The Lead's trusted authorization context is resolved from the active Officer record and system Position code.
2. An active Lead may create and edit Events across all Branches, including global Events with no Branches. Recurrence edits and current roster/signup and Time Slot management use that scope where those workflows already permit them.
3. Other Event administration, historical corrections, Task management, Points, Warnings, and catalog administration keep their existing permissions.
4. The server/database mutation enforces each scope; hiding an action in the interface is not the authorization boundary. Event executives retain global Event management, and Admins retain application-wide administration within product boundaries.

**Important boundaries:** a display name, Event signup, or Task assignment does not grant additional permissions. Task management remains limited to a Lead's Branches.

**Sources:** [authorization contract](../product/authorization.md), [Event contract](../product/events.md), [design screen guidance](../design/screens.md), `lib/authorization.ts`, `app/(protected)/events/actions.ts`, migration `20260928132955_authorization_foundation.sql`.
