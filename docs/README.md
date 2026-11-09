# Cappy Hub documentation

Use this index to find the canonical contract, screen guidance, journey, or data reference for a Cappy Hub workflow.

## Product behavior

- [Product & Technical Specification](product/design-doc.md) is the entry point for approved product requirements, terminology, status, permissions, and technical boundaries.
- [Authorization](product/authorization.md), [Officers](product/officers.md), [Events](product/events.md), [Tasks](product/tasks.md), [Points](product/points.md), [Warnings](product/warnings.md), and [Dashboard and Calendar](product/dashboard-calendar.md) are the domain contracts.
- [Administration and audit history](product/administration-audit.md), [notifications and reminders](product/notifications.md), [recurrence and lifecycles](product/recurrence-lifecycles.md), [approved decisions and implementation status](product/planned-accepted.md), [domain model](product/domain-model.md), and [scope and architecture](product/scope-architecture.md) cover cross-domain rules.

## Visual guidance and journeys

- [Design guidance](design.md) is the entry point for visual and interaction direction; see [screen guidance](design/screens.md) for page-specific references.
- [User journeys](user-journeys/README.md) link real Officer/Admin flows to product, permission, design, and data contracts.

## Data and engineering

- [Database reference](database/README.md) summarizes core entities and relationships. `supabase/migrations/` remains authoritative for database behavior; `lib/database.types.ts` is generated evidence.
- [High-level architecture](architecture.md) describes application boundaries.
- [Database development](database-development.md), [local development](local-development.md), [development workflow](development-workflow.md), [pull requests](pull-requests.md), and [maintainers](maintainers.md) retain their operational ownership.
- [Recurring series](recurring-series.md) and [Google Calendar](google-calendar.md) keep their focused operational responsibilities.

## Authority and maintenance

Product behavior and authorization live in the Product & Technical Specification and approved decisions. Design guidance does not create product policy. Migrations own reproducible schema and database behavior. This index and the supporting references improve navigation; they do not override those sources. When a canonical contract changes, update its owning document, relevant links, and this index if the navigation changes.

## Find a workflow quickly

| Question                                    | Start here                                                   | Then follow                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Event Delete/Restore and its Points effects | [Event journey](user-journeys/event-delete-restore.md)       | [Event contract](product/events.md), [lifecycle contract](product/recurrence-lifecycles.md), [database relationships](database/relationships.md) |
| Task completion and automatic awards        | [Task journey](user-journeys/task-completion.md)             | [Task contract](product/tasks.md), [Points contract](product/points.md), [database relationships](database/relationships.md)                     |
| What a Lead may manage                      | [Lead Event journey](user-journeys/lead-event-management.md) | [Authorization contract](product/authorization.md), [Event screen guidance](design/screens.md)                                                   |
| An Officer’s Event and Task history         | [Officer profile journey](user-journeys/officer-profile.md)  | [Officer contract](product/officers.md), [database relationships](database/relationships.md)                                                     |
