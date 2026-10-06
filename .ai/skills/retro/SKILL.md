---
name: retro
description: Review completed AI-assisted engineering work to identify concrete improvements to skills, rules, context, tooling, and automated checks.
metadata:
  adapted_from:
    - mattpocock/skills retro
---

# Retro

Use completed work as evidence for improving the AI engineering environment.

A retro evaluates the workflow, not the person.

Do not turn one unusual failure into a permanent global rule without evidence that the rule would help future work.

## Process

### 1. Read the evidence

Review the relevant:

- conversation or agent session;
- issue or spec;
- commits and diff;
- verification results;
- review findings;
- failures and rework.

### 2. Identify friction

Look for concrete problems in:

#### Context

- information was hard to find;
- instructions were duplicated;
- source-of-truth conflicts occurred;
- important context was loaded too late;
- too much irrelevant context was always loaded.

#### Skills

- a repeatable workflow was performed manually;
- a skill produced ambiguous behavior;
- a skill duplicated another skill;
- completion criteria were too weak.

#### Rules

- an important judgment rule was missing;
- an existing rule caused unnecessary friction;
- a rule belongs in a project instead of globally.

#### Automated checks

- an error could have been caught deterministically;
- an existing check was not being run;
- CI, linting, typing, tests, or validation had a gap.

Prefer automation over prose rules for mechanical failures.

#### Tools

- repeated expensive or unnecessary tool usage;
- missing access caused guesswork;
- a simpler tool would have produced better evidence.

#### Workflow

- unnecessary approvals;
- excessive context switching;
- poor task boundaries;
- weak handoffs;
- implementation began before decisions were ready.

### 3. Propose improvements

For each meaningful finding include:

- evidence;
- what went wrong;
- proposed change;
- where the change belongs;
- expected benefit;
- risk or tradeoff.

Possible destinations:

- project instructions;
- global rule;
- skill;
- agent;
- template;
- deterministic check;
- no change.

### 4. Classify the result

Use:

- `testing` for a new idea that needs evidence;
- `accepted` when the user explicitly adopts it;
- `rejected` when the user explicitly rejects it;
- `default` when the user explicitly promotes it to normal workflow;
- `replaced` when a newer approach supersedes it.

A retro recommendation is not automatically adopted.

## Rules

- Evidence before policy.
- Do not create permanent rules from stylistic preference alone.
- Mechanical problems should usually become deterministic checks.
- Avoid duplicating instructions across files.
- Keep always-loaded context small.
- Distinguish one-off mistakes from recurring workflow problems.
- The user decides whether a proposed change becomes part of the workflow.

## Completion

A retro is complete when it clearly states:

- what worked;
- what caused friction;
- what should change;
- where the change belongs;
- what should remain unchanged;
- which recommendations still require testing.
