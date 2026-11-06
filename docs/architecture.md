# Cappy Hub architecture

Cappy Hub is an internal administrative web application built with Next.js, React, TypeScript, and Tailwind CSS. Supabase provides PostgreSQL, authentication, Row Level Security (RLS), and trusted database mutation boundaries. The [Product & Technical Specification](product/design-doc.md) defines product contracts; [design guidance](design.md) defines visual and interaction direction.

## Request and data boundaries

Protected pages resolve the authenticated user to an active Officer. Server Actions perform input validation and authorization, then use trusted PostgreSQL functions or authorized database access for sensitive mutations. RLS remains active as a database access boundary. Browser code uses client-safe credentials; privileged credentials stay server-side. See [authorization](product/authorization.md), [database development](database-development.md), and the [database reference](database/README.md).

## Source of truth

- `supabase/migrations/` defines reproducible schema, constraints, RLS, and database functions.
- `lib/database.types.ts` is generated schema evidence, not an independent source of schema authority.
- Product requirements and accepted/planned status live in the [Product & Technical Specification](product/design-doc.md) and its linked approved decisions.
- Current code and tests show repository implementation. They do not establish production deployment.
- Google Calendar is a one-way mirror for eligible Events; Cappy Hub remains authoritative. See [Google Calendar integration](google-calendar.md).

## Cross-domain behavior

Event signups and Volunteer Time Slots determine eligible source-derived Event participation Points. Task assignment completion and due-date eligibility determine source-derived Task Points. Officers retain relationships to historical Events, Tasks, Points, and Warnings across lifecycle changes. Recurring series create independently addressable occurrence records. The [user journeys](user-journeys/README.md) and [database relationships](database/relationships.md) link these behaviors to their contracts.
