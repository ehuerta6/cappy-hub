---
name: writing-for-agents
description: Write and maintain skills, AGENTS.md files, agent instructions, and other documents consumed by AI agents with minimal context load and clear behavior.
---

# Writing for agents

Write agent instructions for reliable execution, not for completeness as documentation.

Every instruction consumes attention.

Keep always-loaded context small and move conditional detail behind clear pointers.

## Principles

### Single source of truth

Keep each rule or workflow authoritative in one place.

Reference the canonical source where it is accessible. For separately installed skills, embed the **smallest task-critical operational subset** needed to work when the repository or sibling files cannot be read. The canonical rule remains the maintenance source.

Unnecessary copy/paste creates drift and gives repeated instructions accidental extra weight; avoid repeating full rule files in every skill.

### Context pointers

A pointer tells the agent:

- what information exists;
- when it should be loaded.

Example:

`Use the database-change skill for schema, migration, RLS, or database authorization changes.`

The trigger matters as much as the destination.

### Progressive disclosure

Keep information at the lowest level that still makes it reliably available.

Prefer:

1. short always-loaded pointer;
2. focused skill or rule;
3. deeper reference loaded only when needed.

Do not put an entire workflow in `AGENTS.md` when a pointer to a skill is enough.

### Steps vs reference

Separate:

- actions the agent must perform;
- reference material it may consult.

Procedural workflows should have a clear sequence.

Reference rules should be grouped by concept.

### Completion criteria

Important steps should define what "done" means.

Prefer observable criteria.

Weak:

`Review the implementation carefully.`

Better:

`Inspect the complete diff and account for every changed file before finishing the review.`

### Positive instructions

Describe the desired behavior directly.

Prefer:

`Make focused changes within the issue scope.`

over long lists of hypothetical bad behaviors.

Use prohibitions for genuine hard guardrails.

### Use the environment as truth

Do not duplicate information the agent can cheaply inspect from:

- package configuration;
- scripts;
- directory structure;
- CI;
- tool help;
- code.

Document the things the environment does not explain:

- intent;
- constraints;
- decisions;
- source precedence;
- known traps.

## Writing skills

A good skill should contain:

- clear name;
- invocation description;
- purpose;
- ordered process when procedural;
- rules that materially change behavior;
- observable completion criteria.

A skill should own one coherent capability.

Split skills when they have independent triggers or substantially different workflows.

Do not split merely to make files shorter.

## Writing AGENTS.md

Use `AGENTS.md` primarily for:

- source-of-truth pointers;
- important project-wide constraints;
- navigation to applicable skills or docs.

Avoid turning it into a complete engineering handbook.

## Pruning

For every instruction ask:

- does this change agent behavior?
- does it belong here?
- does it duplicate another source?
- can the environment answer this instead?
- does every task need this in context?

Delete instructions that no longer earn their context cost.

## Rules

- One authoritative home per behavior.
- Project-specific context stays in project repositories.
- Global rules should be broadly reusable.
- Prefer precise triggers over broad descriptions.
- Do not hide critical requirements behind weak optional wording.
- Avoid redundant instructions across skills and rules; allow a concise, intentionally maintained subset needed for standalone skill execution.

## Completion

Agent-facing writing is complete when:

- responsibilities are clear;
- triggers are clear;
- sources of truth are clear;
- conditional detail is loaded only when needed;
- completion can be evaluated;
- duplicated or stale instructions have been removed.
