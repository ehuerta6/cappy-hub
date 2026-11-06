# Project knowledge

Use this directory for durable, complementary context—not a second product specification, a record of routine PR progress, or a replacement for implementation evidence.

## Find capability context

- Start with the [capability map](capabilities.md) to locate a domain, status, canonical contract, and related slices.
- Open only the relevant [slice documents](slices/). Follow their links to approved product/design contracts and then to Issues, migrations, routes, tests, or code as needed for the claim.
- For repeatable discovery, capture, reconciliation, and coverage maintenance, use the local [`cappy-knowledge` skill](../.agents/skills/cappy-knowledge/SKILL.md). It complements the reusable [project-knowledge workflow](../.agents/skills/project-knowledge/SKILL.md).

## Source ownership

The Product & Technical Specification in [`docs/product/`](../docs/product/design-doc.md) owns product behavior, terminology, permissions, lifecycle rules, and approved/planned status. [`docs/design.md`](../docs/design.md) is the entry point for visual/interaction guidance. Focused specifications and approved Issues retain their established precedence. `supabase/migrations/` owns reproducible schema and database behavior; code and tests evidence repository implementation. Repository implementation does not prove production deployment.

Knowledge notes explain relationships, rationale, and verified lessons when that context is useful. They link to their owning source instead of copying normative requirements. A note never approves a proposal or changes the implementation scope of an Issue.

When a canonical specification changes, a capability is approved, implementation status changes on `main`, or a workflow is retired, update the owning source first and then reconcile affected slices and the catalog status in the same documentation follow-up.
