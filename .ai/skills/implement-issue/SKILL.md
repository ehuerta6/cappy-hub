---
name: implement-issue
description: Implement a Cappy Hub GitHub Issue with the smallest change that satisfies its documented requirements.
---

# Implement an issue

1. Read the issue and its comments completely. Find the relevant Product & Technical Specification requirements if that document is available; otherwise state the missing source rather than inventing behavior.
2. Inspect related code, tests, migrations, and established patterns. Identify the minimum scope and affected UI, server, database, and test layers.
3. Implement incrementally, with appropriate tests for behavior that changes. Reuse existing patterns and dependencies.
4. Use `database-change` if schema, RLS, or database functions change. Near completion, use `verify-change` and compare the final diff against the issue and specification.
5. Prepare a concise PR summary: problem, changes, tests, and material decisions or limitations. Follow the repository PR template.

Avoid unrelated refactors, speculative features, unnecessary dependencies, and features added merely because other applications commonly have them.
