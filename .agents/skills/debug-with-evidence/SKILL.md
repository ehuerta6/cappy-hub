---
name: debug-with-evidence
description: Diagnose bugs and regressions by reproducing the exact failure, gathering evidence, testing hypotheses, and verifying the fix.
metadata:
  adapted_from:
    - mattpocock/skills diagnosing-bugs
    - cappy-hub debugging workflow
---

# Debug with evidence

Debug by establishing evidence before changing code.

The goal is to understand the failure, not to guess until something works.

## Process

### 1. Understand the symptom

Identify:

- what the user expected;
- what actually happened;
- where it happened;
- whether it is reproducible;
- what changed recently when known.

Do not treat nearby errors as proof of the root cause.

### 2. Build a reproduction

Create the smallest reliable signal that demonstrates the exact bug.

Prefer, in roughly this order:

- existing failing test;
- focused new regression test;
- CLI command;
- HTTP request;
- browser reproduction;
- minimal local fixture;
- captured logs or traces.

The reproduction should fail because of the reported bug and become successful when the bug is fixed.

### 3. Gather evidence

Inspect the relevant:

- code path;
- logs;
- errors;
- state;
- network requests;
- data;
- configuration;
- recent changes.

Redact secrets and credentials from captured output.

### 4. Form hypotheses

Generate a small set of plausible causes.

Rank them by evidence.

For each hypothesis, define what observation would support or reject it.

Avoid editing code merely to test a vague guess when a smaller diagnostic check can answer the question.

### 5. Test hypotheses

Test the highest-value hypothesis first.

Use instrumentation or temporary diagnostics when useful.

Remove temporary debugging code before completion.

Update the hypothesis ranking as evidence changes.

### 6. Fix the root cause

Once evidence supports a cause:

- make the smallest correct fix;
- avoid unrelated cleanup;
- preserve behavior outside the bug;
- add a regression test when practical.

### 7. Verify

Run the reproduction again.

It should now pass.

Then use `verify-change` for the relevant repository checks.

## Rules

- Reproduce before fixing when reasonably possible.
- Evidence outranks intuition.
- Do not hide errors with arbitrary fallbacks or broad exception handling.
- Do not change several unrelated things at once to see what works.
- Distinguish the root cause from symptoms.
- Never expose secrets in logs, reports, or artifacts.
- If reproduction is impossible, state what evidence is missing instead of pretending certainty.

## Completion

Debugging is complete when:

- the original symptom is understood;
- the cause is supported by evidence;
- the fix addresses that cause;
- the original reproduction now succeeds;
- relevant regression protection exists;
- remaining uncertainty is reported.
