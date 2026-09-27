---
name: cappy-hub-checklist
description: Reconcile Cappy Hub's MVP implementation checklist with completed repository work. Use at the end of implementation tasks or when asked to audit checklist progress; do not use it to change product requirements.
---

# Cappy Hub implementation checklist

Keep [`docs/progress/mvp-implementation-checklist.md`](../../../docs/progress/mvp-implementation-checklist.md) aligned with what the repository actually implements. The product source of truth is [`docs/product/design-doc.md`](../../../docs/product/design-doc.md); the checklist tracks implementation and release readiness, not new requirements.

## When to update

At the end of a task that changes application code, migrations, or other implementation artifacts, review the relevant checklist sections. If the task is planning, investigation, or documentation-only, leave implementation status alone unless the user asks for a checklist audit.

## Evidence rules

- Inspect the resulting diff and relevant code, migrations, and existing verification results before changing a checkbox.
- Mark an item `[x]` only when its entire criterion is implemented in the current repository state. Leave partial work `[ ]`.
- A migration proves the schema change is represented in the repository; it does not prove that a live Supabase project has applied it. Mark live-database claims only after checking the connected project's actual state.
- Mark test, CI, security-review, and production-readiness items only when the corresponding evidence exists. A feature implementation alone does not prove its acceptance or release checks pass.
- Do not mark planned work, intended behavior, or requirements described in the Design Doc as completed without implementation evidence.
- Preserve unchecked items and existing notes. Correct a stale checked item only when the current repository clearly disproves it; do not broadly re-audit unrelated sections.
- Do not edit the Design Doc as part of checklist maintenance. Product changes require an explicit product decision or user request.

After updating, report which checklist areas changed and what relevant verification was actually completed. Never claim checks ran if they did not.
