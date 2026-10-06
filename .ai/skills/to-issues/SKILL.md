---
name: to-issues
description: Break an approved spec or large feature into focused, connected GitHub Issues that can be implemented independently by fresh agents.
metadata:
  inspired_by: mattpocock/skills to-tickets
---

# To issues

Turn an approved specification into a dependency graph of implementation-ready GitHub Issues.

The goal is not to create a checklist of technical layers.

The goal is to create small, meaningful units of product behavior that can be implemented and verified independently.

## Process

### 1. Gather context

Read:

- the complete approved spec;
- the parent GitHub Issue when one exists;
- relevant project instructions;
- enough of the existing codebase to understand integration points and current conventions.

Do not reopen product decisions already settled by the spec.

### 2. Identify implementation slices

Prefer vertical slices.

A good issue delivers a narrow but complete behavior across whichever layers are required.

Prefer:

- create a session end-to-end;
- edit an officer end-to-end;
- reveal a solution end-to-end.

Avoid horizontal decomposition such as:

- build database;
- build backend;
- build frontend.

A completed issue should produce something independently testable, demonstrable, or structurally necessary for later work.

### 3. Size issues for agents

Each issue should:

- fit comfortably in one fresh agent context;
- have one clear responsibility;
- avoid unrelated cleanup;
- contain enough context to execute without guessing;
- have observable acceptance criteria.

Split an issue when it contains multiple independently useful behaviors.

Merge issues when separating them would create artificial coordination without useful isolation.

### 4. Determine dependencies

For every issue identify genuine blockers.

Do not create a linear chain unless the work truly requires one.

Independent issues should remain independent so they may be implemented concurrently.

Think of the result as a dependency graph:

Parent spec
├── Issue A
├── Issue B
│ └── Issue D
└── Issue C
└── Issue E

An issue is ready when all of its blockers are complete.

### 5. Handle broad refactors carefully

Vertical slices are the default.

For a mechanical change whose blast radius makes independent vertical slices impossible, use an expand-migrate-contract sequence:

1. Expand: introduce the new form without removing the old one.
2. Migrate: move callers in bounded batches.
3. Contract: remove the old form after migration is complete.

Keep the repository working between stages whenever practical.

### 6. Present the proposed breakdown

Before creating GitHub Issues, show:

1. issue title;
2. what it delivers;
3. acceptance criteria;
4. blockers;
5. relationship to the parent spec.

Ask for approval when the user has not already explicitly authorized creating the issues.

### 7. Create GitHub Issues

Create blockers before dependent issues so dependency references can use real issue numbers.

Use this structure:

## Parent

Reference the parent spec or parent GitHub Issue.

## What to build

Describe the behavior delivered by this issue from the project's perspective.

## Acceptance criteria

- [ ] Observable criterion
- [ ] Observable criterion

## Blocked by

Reference blocking issues.

Use `None` when the issue can start immediately.

## Notes

Include only implementation constraints or decisions needed to preserve the spec.

Omit this section when unnecessary.

### 8. Connect the graph

When GitHub supports the required relationship, use native sub-issue or dependency relationships.

Otherwise reference related issue numbers explicitly in the issue body.

The parent should make it easy to discover the complete implementation set.

## Rules

- The approved spec is the contract.
- Do not silently expand scope.
- Do not invent requirements.
- Prefer vertical slices.
- Do not create one issue per technical layer.
- Do not include exact file paths unless they are a required constraint.
- Do not prescribe implementation details the spec does not require.
- Preserve project terminology.
- Acceptance criteria describe behavior, not implementation steps.
- Dependencies must represent real blockers, not preferred ordering.
- Do not close or modify the parent issue unless explicitly requested.

## Completion

The breakdown is complete when:

- every requirement in the spec is covered;
- every issue has a clear outcome;
- every issue has verifiable acceptance criteria;
- dependencies are explicit;
- no issue requires unresolved product decisions;
- each issue can be understood by a fresh implementation agent.

The resulting issues are ready for `implement-issue`.
