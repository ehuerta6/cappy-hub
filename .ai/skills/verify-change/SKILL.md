---
name: verify-change
description: Verify a Cappy Hub implementation before a meaningful PR, using targeted checks while editing and the repository validation suite at completion.
---

# Verify a change

1. Inspect changed files and identify the behaviors and boundaries they affect. Run focused tests while iterating; avoid rerunning the full suite after every small edit.
2. Before completing a meaningful PR, run `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run build`. Before full `npm test`, use `local-database-workflow` to prepare the migrations-only local database (`npm run db:start`, `npm run db:reset`) so pgTAP never runs against an arbitrary or seeded state. Delegate all local Supabase state handling and failure diagnosis to that skill.
3. For database changes, also use the relevant replay, generated-type, upgrade, and seed checks described in `database-change` and `README.md`.
4. Inspect the final diff for scope, security, and missing tests. Report each check and its outcome. Fix failures caused by the change; do not hide or bypass them.
