---
name: grill-me
description: Stress-test a feature, plan, architecture decision, or product idea until the important decisions are explicit and shared.
metadata:
  inspired_by: mattpocock/skills grilling
---

# Grill me

Use this skill when an idea is still ambiguous enough that implementation would require guessing.

The goal is shared understanding, not implementation.

## Process

1. Read the existing conversation, project instructions, specs, issues, and relevant code before asking questions.
2. Separate facts from decisions.
3. Research facts yourself when they can be discovered from the repository, documentation, tools, or other available sources.
4. Build a decision tree:
   - start with decisions that do not depend on unresolved decisions;
   - resolve those first;
   - use their answers to expose the next decisions.
5. Ask questions in rounds instead of one at a time.
6. For every question:
   - explain what decision is being made;
   - give concrete options when useful;
   - recommend an option and explain why;
   - leave the final decision to the user.
7. Recompute the unresolved decision frontier after every round.
8. Stop when implementation would no longer require guessing about product behavior, scope, architecture, or important constraints.

## Rules

- Do not ask the user for facts you can inspect yourself.
- Do not invent requirements.
- Do not expand the feature while clarifying it.
- Do not turn every detail into a decision.
- Do not implement the result unless explicitly asked.
- Preserve established project terminology.
- Explicit project decisions override generic recommendations.

## Completion

The session is complete when:

- goals are clear;
- non-goals are clear;
- important behavior is decided;
- meaningful edge cases are addressed;
- technical constraints that affect the feature are known;
- no important implementation decision depends on an unanswered product question.

The result should be ready for `to-spec`.
