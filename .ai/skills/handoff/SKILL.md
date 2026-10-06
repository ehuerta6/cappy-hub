---
name: handoff
description: Transfer unfinished work to a fresh agent or session using concise context pointers instead of duplicating existing artifacts.
metadata:
  adapted_from:
    - mattpocock/skills handoff
---

# Handoff

Create enough context for a fresh agent to continue the work without reconstructing the session from scratch.

Prefer references to durable artifacts over copying their contents.

## Include

### Goal

What the user is trying to achieve.

### Current state

What has already been completed.

### Decisions

Only decisions that materially affect future work.

### Relevant artifacts

Point to existing:

- specs;
- GitHub Issues;
- pull requests;
- commits;
- documentation;
- files;
- research notes.

Do not duplicate their full contents.

### Remaining work

Describe what still needs to happen.

### Blockers or open questions

Record anything that prevents safe continuation.

### Verification state

State:

- what has been tested;
- what passed;
- what failed;
- what has not been verified.

### Suggested skills

List relevant skills the next agent should use.

## Rules

- Keep the handoff compact.
- Prefer pointers over duplicated context.
- Preserve exact identifiers when they matter.
- Do not invent completed work.
- Do not claim verification that did not happen.
- Redact secrets, credentials, and unnecessary personal information.
- Do not repeat information already stored in canonical artifacts.

## Completion

A handoff is complete when a fresh agent can identify:

- the goal;
- the current state;
- the authoritative context;
- the next useful action;
- unresolved risks or questions.
