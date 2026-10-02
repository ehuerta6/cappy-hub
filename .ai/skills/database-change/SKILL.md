---
name: database-change
description: Use for Cappy Hub Supabase migrations, PostgreSQL schema, constraints, RLS, database functions or authorization, and generated database types.
---

# Database change

1. Inspect current schema, migration history, affected functions/policies, tests, and `supabase/seed.sql`. Define the integrity or authorization requirement before editing.
2. Add a migration; account for keys, foreign keys, nullability, uniqueness, checks, existing data, and RLS where relevant. Keep trusted mutation authorization at the database or server boundary.
3. Replay migrations locally with `npm run db:start` and `npm run db:reset` (or `npm run local:reset` for the full app). Fix replay and seed incompatibilities; do not patch a hosted database manually.
4. If generated types change, run `npm run db:types` and `npm run db:types:check`. Run relevant database tests through `npm test`; use `npm run test:db:upgrade` when migration preservation matters, and `npm run test:local-seed` for seed compatibility.
5. Review the security impact, including policies, function privileges, and the data visible to each role. Document material migration decisions in the PR.

Never test against production, deploy the synthetic seed to production, put service-role credentials in browser code, disable RLS as a shortcut, or make schema changes that cannot be replayed from migrations. Confirm command details in `package.json` and `README.md` before running them.
