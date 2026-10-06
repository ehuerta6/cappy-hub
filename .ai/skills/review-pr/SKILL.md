---
name: review-pr
description: Review a pull request or completed diff separately against its requirements and against Cappy Hub's engineering standards.
metadata:
  adapted_from:
    - cappy-hub review-pr
    - cappycode review-pull-request
    - mattpocock/skills code-review
---

# Review PR

Review completed work along two independent axes:

1. requirements;
2. engineering quality.

A change can succeed on one axis and fail on the other.

Do not let good code excuse incorrect product behavior, or correct behavior excuse unsafe code.

For Cappy Hub, project-specific product requirements, architecture, security rules, database workflows, and repository conventions override generic review preferences.

## Process

### 1. Gather context

Read:

- the complete diff;
- linked GitHub Issue;
- acceptance criteria;
- approved feature specification when available;
- the current Cappy Hub Product & Technical Specification when relevant;
- applicable project instructions;
- relevant repository documentation;
- surrounding implementation where needed;
- related migrations and tests when database behavior changed.

Review the whole change, not isolated snippets.

The active GitHub Issue defines the implementation scope.

Existing code is evidence of current implementation, not automatically the intended product requirement.

If requirements, specifications, repository behavior, or accepted decisions materially conflict, report the conflict rather than silently choosing a new requirement.

### 2. Review requirements

Check whether the implementation:

- satisfies every acceptance criterion;
- matches the approved specification;
- follows explicit product decisions;
- preserves explicitly required behavior;
- omits requested behavior;
- adds behavior that was not requested;
- handles required states and edge cases;
- stays within the GitHub Issue's scope.

Report requirement mismatches separately from code-quality findings.

Do not treat an unrelated improvement as required work unless the Issue or approved specification requires it.

### 3. Review engineering quality

Check for:

- correctness bugs;
- regressions;
- unsafe assumptions;
- unnecessary complexity;
- speculative abstractions;
- unnecessary dependencies;
- duplicate logic where an established project pattern already exists;
- missing validation;
- missing tests;
- error handling that hides failures;
- security or authorization mistakes;
- data integrity problems;
- accessibility regressions when UI changed;
- unrelated refactors or redesigns.

Respect documented Cappy Hub standards over generic preferences.

Do not report stylistic preferences that repository tooling already enforces.

For UI changes, respect `docs/design.md` and existing Cappy Hub interaction patterns rather than proposing unrelated redesigns.

### 4. Review database and authorization changes

When a change affects Supabase, PostgreSQL, authentication, authorization, schema, or database behavior, also check:

- schema changes are represented through reproducible `supabase/migrations/`;
- migration replay is safe for existing data;
- important invariants are enforced with appropriate PostgreSQL constraints;
- Row Level Security remains enabled where required;
- RLS policies enforce the intended access rules;
- sensitive authorization is enforced at a trusted database or server boundary;
- browser code does not receive Supabase service-role or other privileged credentials;
- SQL functions use appropriate privileges and execution context;
- database functions cannot bypass authorization unintentionally;
- generated database types remain consistent with the schema;
- `supabase/seed.sql` remains synthetic local/test data only;
- local development and production data boundaries remain intact;
- seed compatibility and upgrade paths are preserved when relevant.

Use the project's database-specific workflows and documentation as the authority for expected database verification.

### 5. Evaluate verification

Check whether the evidence actually demonstrates the changed behavior.

Look for:

- missing tests;
- tests that only verify implementation details;
- acceptance criteria with no verification;
- database behavior tested against an inappropriate local state;
- missing migration or type checks when database behavior changed;
- checks claimed as passing without evidence.

Do not assume a green lint, typecheck, build, or test suite proves product correctness.

Verification claims must match what was actually run.

### 6. Report findings

Order findings by severity.

For each finding include:

- severity;
- file or relevant location;
- what is wrong;
- concrete failure scenario or impact;
- requirement or project standard involved when applicable.

Keep findings actionable and evidence-based.

Do not manufacture findings to make the review look thorough.

If no actionable findings exist, say so.

### 7. Report residual risk

After findings, note meaningful verification gaps or areas not exercised.

Give a clear recommendation:

- ready;
- changes required.

## Review axes

Keep these mentally separate.

### Requirements

Did we build the right thing?

### Engineering

Did we build it safely and maintainably?

## Rules

- Findings first.
- Evidence over preference.
- Do not nitpick for volume.
- Do not silently broaden the Issue scope.
- Do not treat generic best practices as Cappy Hub requirements.
- Do not rewrite the implementation during review unless explicitly asked.
- Do not invent defects without a plausible failure mode.
- Do not recommend architecture, dependencies, or redesigns without a concrete requirement.
- Product requirements and permissions outrank design recommendations.
- Never recommend weakening authorization, RLS, constraints, or production-data protections to simplify implementation.

## Completion

A review is complete when:

- the full diff has been inspected;
- requirements have been checked;
- engineering quality has been checked;
- applicable database and authorization behavior has been checked;
- verification gaps are identified;
- actionable findings include evidence;
- scope mismatches are surfaced;
- the final recommendation is clear.
