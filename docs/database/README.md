# Database reference

This directory is a navigational guide to Cappy Hub's PostgreSQL model and its main relationships. It summarizes selected entities, keys, integrity rules, and access boundaries for orientation; it does not reproduce every column, constraint, policy, or function.

## Authority and maintenance

- [`supabase/migrations/`](../../supabase/migrations/) is the authoritative, replayable source for schema, constraints, database functions, grants, and Row Level Security (RLS).
- [`lib/database.types.ts`](../../lib/database.types.ts) is generated schema evidence for application-facing tables, views, functions, and inferred relationships. It is not a replacement for migrations and may omit private-schema implementation details.
- Update this reference when an approved schema change materially changes the entities, relationships, integrity boundaries, or access model described here. Verify every claim against the relevant migration and regenerate types when the project workflow requires it.

## Pages

- [Schema overview](schema.md) — public tables and views grouped by domain, their primary purpose, important keys, and selected integrity/access boundaries.
- [Relationships](relationships.md) — major foreign-key paths and cross-domain links.

For exact column definitions, constraints, policies, function bodies, indexes, and migration order, follow the linked migrations and generated types.
