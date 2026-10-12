---
name: implement-issue
description: Implement one approved Cappy Hub GitHub Issue from scope discovery through a verified, review-ready change.
metadata:
  adapted_from:
    - cappy-hub implement-issue
    - cappycode implement-github-issue
---

# Implement issue

Implement exactly one approved GitHub Issue.

The active Issue defines the implementation scope.

The current Cappy Hub Product & Technical Specification, explicit user decisions, and approved feature specifications define the product requirements around it.

Repository documentation, migrations, and existing code provide implementation context but do not silently redefine intended product behavior.

## Process

### 1. Read the work

Read the complete Issue:

- title;
- body;
- acceptance criteria;
- comments;
- linked specifications;
- linked issues;
- blockers.

Identify the exact behavior the Issue must deliver.

Also identify what is explicitly outside scope.

If the Issue depends on unresolved product or technical decisions that materially affect implementation, use `grill-me` or surface the unresolved decision before inventing a requirement.

If sources materially conflict, report the conflict instead of silently choosing one.

### 2. Inspect the repository

Before editing:

- read applicable project instructions;
- inspect surrounding implementation;
- inspect related tests;
- inspect relevant repository documentation;
- identify existing patterns and abstractions;
- identify configured validation commands;
- inspect relevant schema, API, state, UI, and authorization boundaries;
- inspect related migrations when database behavior is involved.

Inspect `package.json` before assuming framework versions, dependencies, or scripts.

For Next.js work, follow the repository's current Next.js guidance rather than relying on remembered framework behavior.

Use the existing architecture unless the Issue explicitly requires changing it.

### 3. Define the minimum change

Determine:

- which behavior must change;
- which layers are actually affected;
- which existing patterns should be reused;
- what tests need to change or be added;
- what explicitly remains outside scope.

Prefer the smallest correct implementation.

Do not bundle unrelated cleanup, redesigns, dependency changes, or refactors.

Do not introduce speculative abstractions for hypothetical future requirements.

### 4. Use specialized workflows when applicable

Use `database-change` when the Issue affects:

- PostgreSQL schema;
- migrations;
- constraints;
- Row Level Security;
- database functions;
- sensitive authorization;
- generated database types;
- other persistent database behavior.

Use `local-database-workflow` when the work involves:

- local Supabase state;
- pgTAP or the full database-backed test suite;
- migrations-only database state;
- seeded local-development state;
- database connection or local-state failures.

Use `debug-with-evidence` when implementation exposes a non-trivial failure whose root cause is not already known.

For focused UI/UX shaping, critique, hardening, or polish, use `impeccable` while treating `docs/design.md` and product requirements as higher authority.

Do not force another workflow onto the task when it is unnecessary.

### 5. Implement incrementally

Make focused edits.

When behavior changes:

- add or update meaningful tests;
- preserve behavior outside the Issue;
- reuse established project patterns;
- reuse existing dependencies when suitable;
- preserve current architecture unless the requirement demands otherwise;
- enforce important invariants at the appropriate trusted boundary.

Do not weaken authorization, Row Level Security, database constraints, or production-data protections to make implementation easier.

Never expose Supabase service-role or other privileged credentials to browser code.

Do not use production data for development or testing.

Schema changes must be reproducible through migrations.

### 6. Verify acceptance criteria

Before considering implementation complete:

- check every acceptance criterion individually;
- verify the requested user-visible or system behavior;
- confirm no requirement was silently skipped;
- confirm no unrequested behavior was added;
- confirm the implementation remains within Issue scope.

Then use `verify-change`.

When database behavior changed, also perform the applicable checks defined by `database-change` and `local-database-workflow`.

Do not claim any command or check passed unless it actually ran successfully.

### 7. Review the final diff

Inspect the complete diff.

Look for:

- unrelated edits;
- accidental files;
- debug code;
- stale comments;
- missing tests;
- unnecessary dependencies;
- unnecessary abstractions;
- requirement mismatches;
- security regressions;
- authorization regressions;
- migration or generated-type inconsistencies;
- unintended UI redesign;
- scope creep.

Remove unrelated changes before delivery.

If additional work is discovered that is useful but outside the Issue, report it separately rather than silently implementing it.

### 8. Prepare delivery

Follow the repository's current development, Git, Pull Request, validation, and database documentation.

Do not duplicate or override those procedures inside this skill.

Keep the branch and Pull Request focused on the Issue.

Use the repository's established commit and PR conventions.

Link the implementation Pull Request to its Issue when applicable.

Report:

- what changed;
- what was verified;
- any relevant limitations or implementation decisions;
- anything intentionally left outside scope;
- any follow-up work discovered.

Do not merge unless the user explicitly asks for the merge.

## Rules

- The GitHub Issue is a scope boundary, not permission to redesign adjacent systems.
- Do not invent missing requirements.
- Read before editing.
- Prefer current Cappy Hub patterns over introducing new ones.
- Prefer simple, direct code.
- Preserve existing architecture unless a documented requirement demands otherwise.
- Do not hide failures with broad exception handling, arbitrary fallback values, silent error swallowing, or fake success states.
- Do not claim checks passed unless they were actually run.
- Do not silently modify unrelated behavior.
- Do not introduce dependencies without a concrete need.
- Do not use production data for development or testing.
- Do not make manual production or Supabase Dashboard changes the source of truth for schema behavior.

## Completion

The Issue is implementation-complete when:

- all acceptance criteria are satisfied;
- the implementation matches approved requirements;
- the implementation remains within Issue scope;
- relevant tests exist;
- applicable database checks are complete;
- validation succeeds or failures are reported accurately;
- the final diff contains only intentional changes;
- no known security or authorization regression remains;
- the change is ready for independent review.
