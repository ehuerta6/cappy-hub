---
name: verify-change
description: Verify a Cappy Hub implementation before a meaningful PR, using targeted checks while editing and the repository validation suite at completion.
---

# Verify a change

1. Inspect changed files and identify the behaviors and boundaries they affect. Run focused tests while iterating; avoid rerunning the full suite after every small edit.
2. Before completing a meaningful PR, run the documented checks: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`.
3. For database changes, also use the relevant replay, generated-type, upgrade, and seed checks described in `database-change` and `README.md`.
4. Inspect the final diff for scope, security, and missing tests. Report each check and its outcome. Fix failures caused by the change; do not hide or bypass them.
