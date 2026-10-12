---
name: to-spec
description: Turn already-resolved product and engineering decisions into a durable implementation specification without reopening settled decisions.
metadata:
  inspired_by: mattpocock/skills to-spec
---

# To spec

Convert the current discussion and verified project context into a specification.

This skill synthesizes decisions that already exist. It does not conduct another interview.

## Process

1. Read the relevant conversation, project instructions, existing documentation, issues, and code.
2. Identify the latest explicit decisions.
3. Resolve conflicts using the project's documented source-of-truth hierarchy.
4. Distinguish:
   - confirmed requirements;
   - implementation decisions;
   - constraints;
   - unresolved questions.
5. Write the specification using the structure below.
6. Do not silently resolve unanswered questions. Record them under `Open questions`.
7. Save or publish the spec where the project expects specifications to live.

## Specification structure

# Spec: <feature name>

## Problem

Describe the actual problem being solved.

## Goals

List the outcomes this work must achieve.

## Non-goals

List related work that is explicitly outside this change.

## User-visible behavior

Describe the behavior from the user's perspective.

## Functional requirements

List concrete requirements that the implementation must satisfy.

## Constraints

Record technical, product, security, compatibility, or operational constraints.

## Edge cases

Document important states and failure cases that must be handled.

## Implementation decisions

Record decisions already made that materially constrain the implementation.

Prefer durable architectural or behavioral decisions over file paths or temporary implementation details.

## Data and interface changes

Describe schema, API, state model, contracts, or external interface changes when applicable.

Omit this section when none are required.

## Acceptance criteria

Use verifiable criteria.

Each criterion should describe an observable result, not an implementation step.

## Verification

Describe how the finished behavior can be demonstrated or tested.

Use the project's existing test and validation strategy where possible.

## Open questions

List unresolved decisions that would require guessing during implementation.

Use `None` when no meaningful questions remain.

## Rules

- Preserve facts and established decisions.
- Do not invent requirements.
- Do not add features because they are common elsewhere.
- Do not include speculative architecture.
- Avoid code snippets and exact file paths unless they encode an important decision better than prose.
- Use project terminology consistently.
- Keep implementation flexible where the product does not require a specific approach.

## Completion

A spec is ready when another agent can read it and understand:

- what problem to solve;
- what behavior must exist;
- what must not be built;
- what constraints apply;
- what counts as complete.

If important `Open questions` remain, the spec is not ready for implementation.

Use `grill-me` to resolve them first.

Once approved, the spec can be passed to `to-issues`.
