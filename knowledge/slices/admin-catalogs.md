# Administrative catalogs

**Status:** Shipped in repository `main` at [`2202dee`](https://github.com/ehuerta6/cappy-hub/tree/2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7); repository evidence does not establish production deployment.

**Actors:** Admins maintain catalog values; authorized Officers consume those values in Officer, Event, and Task workflows.

Admins manage established catalogs in the workflows that consume them: Positions, Branches, Event Types, reusable Event locations, and Task Types. These settings support Officer, Event, and Task work; they are not a generic catalog platform. Keep each catalog's existing owner, data model, and authorization boundary. The Task Type CRUD exception was specifically approved in [Issue #347](https://github.com/ehuerta6/cappy-hub/issues/347) and implemented in [PR #355](https://github.com/ehuerta6/cappy-hub/pull/355); it does not authorize a generic framework. The product rationale and wider scope are in [Administration and audit history](../../docs/product/administration-audit.md) and [approved decisions](../../docs/product/planned-accepted.md).

Catalog Delete is recoverable: it retains identity and existing references while preventing new assignment; Restore makes the same value available again. Required system Positions have protected machine identities; custom Position display names do not grant permissions. This boundary belongs with catalog administration because it concerns configuration lifecycle, while person status and account authorization remain in [Officer lifecycle](officers.md) and [Identity and access](identity-access.md).

**Slice boundary:** Covers reusable classification and assignment catalogs. Point rates are owned by [Points](points.md); academic date ranges are owned by [Academic periods](academic-periods.md).

Implementation evidence: [catalog page](../../app/%28protected%29/officers/catalogs/page.tsx), [catalog actions](../../app/%28protected%29/officers/catalogs/actions.ts), [catalog lifecycle migration](../../supabase/migrations/20261030173700_recoverable_catalogs.sql), [Task Type migration](../../supabase/migrations/20261030210000_task_type_catalog.sql), [catalog manager tests](../../tests/catalog-manager.test.tsx), and [catalog navigation tests](../../tests/catalog-navigation.test.ts).

**Aliases:** Admin catalogs, Position, Branch, Event Type, reusable Event location, Task Type, recoverable catalog, Delete/Restore.
