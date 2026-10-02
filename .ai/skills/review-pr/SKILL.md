---
name: review-pr
description: Review a completed Cappy Hub diff or PR against its issue, product specification, project patterns, security rules, and tests.
---

# Review a PR

Read the issue and applicable Product & Technical Specification, if available, then inspect the complete diff and surrounding implementation. Check for correctness bugs, regressions, requirement mismatches, scope creep, missing authorization, RLS errors, exposed credentials, unsafe or unreplayable migrations, data-integrity gaps, missing tests, unnecessary abstractions or dependencies, and duplicated code where a project pattern already exists.

Return actionable findings with file locations, ordered by severity. Explain the failing scenario and evidence. Omit categories with no findings; do not manufacture feedback. Mention residual risk or testing gaps separately when useful.
