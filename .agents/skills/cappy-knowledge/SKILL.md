---
name: cappy-knowledge
description: Find and maintain Cappy Hub's capability catalog and source-grounded vertical-slice context.
---

# Cappy knowledge

Use this Cappy Hub-specific workflow when a task needs cross-domain product context, when an approved capability/specification changes, or when auditing knowledge coverage. It is a small navigation and maintenance layer over the reusable [`project-knowledge`](../project-knowledge/SKILL.md) workflow. It does not replace canonical product/design documentation or GitHub Issues.

## Discover and retrieve

1. Read [`knowledge/README.md`](../../../knowledge/README.md), then search [`knowledge/capabilities.md`](../../../knowledge/capabilities.md) for the relevant capability or alias.
2. Open only the matching [`knowledge/slices/`](../../../knowledge/slices/) notes. Follow their canonical contract links before answering or making a change that depends on product intent.
3. For claims about approved scope, follow the relevant Issue/specification and accepted clarification. For claims about shipped behavior, verify current `main` routes/actions/tests or migrations as appropriate. Do not infer production deployment from repository state.
4. Follow related slices only when the workflow crosses their boundaries. A note is a discovery aid, not approval or implementation proof.

## Capture or update

1. Record a note only for a genuinely useful, source-backed cross-domain relationship, consequential rationale, durable constraint, or verified implementation lesson. Routine PR progress stays in GitHub.
2. Keep normative behavior in its canonical specification and approved decision in its Issue/spec. In the slice, summarize why the relationship matters and link the owner; never copy permission matrices, complete contracts, SQL, or Issue/PR histories.
3. Update the existing slice and catalog entry when approved behavior changes, a new capability is approved, a status changes, or a capability is retired. Add a slice only for a meaningful end-to-end responsibility; combine related topics when a split would invent artificial modularity.
4. Mark shipped-on-main, approved/planned, historical, and unresolved claims separately. State the inspected revision for implementation claims. Keep production/deployment status separate and label it unverified unless independently evidenced.

## Reconcile and audit coverage

1. Compare claims with the source hierarchy in [`AGENTS.md`](../../../AGENTS.md): product specification, newest explicit decision, approved feature specs, active Issue/clarifications, repository docs/migrations, then code as implementation evidence.
2. For coverage audits, start with the capability map and compare it with product/design docs, focused specs, routes/actions, migrations/functions/RLS, types, tests, and relevant Issues/PRs. Use code/tests to establish implementation evidence, not product approval.
3. Check catalog-to-slice and slice-to-canonical links, status basis, aliases, cross-slice relationships, duplicated contracts, dead links, and retired/planned claims. Keep the audit revision and any unresolved gaps explicit.
4. If approved sources materially conflict or intended behavior is unresolved, identify the evidence and ask the owner rather than selecting a product rule. Continue independent work that does not depend on that choice.

## Writing rules

- Give each note a descriptive title, recognizable aliases, explicit status and status basis, concise purpose/boundaries, useful end-to-end relationships, and direct canonical/evidence links.
- Write focused headings and self-contained passages that remain meaningful when retrieved alone.
- Keep notes succinct and complementary. Do not create runtime indexing, generated catalogs, embeddings, vector search, RAG infrastructure, or agent personas.

## Completion

A retrieval answer identifies the relevant capability and follows authoritative sources. A capture leaves one coherent, sourced note and an accurate catalog entry. A coverage audit reports the inspected revision, mapped capabilities, missing/stale/duplicate references, and unresolved decisions without inventing behavior.
