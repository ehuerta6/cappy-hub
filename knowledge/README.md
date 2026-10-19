# Project knowledge

Use this directory only for durable decisions, rationale, constraints, or verified lessons that are likely to change future work or prevent repeated investigation. Invoke the [project-knowledge workflow](../.agents/skills/project-knowledge/SKILL.md) when that context matters, when preserving an approved decision, or when explicitly asked to review project knowledge.

Before adding a note, search this directory for the relevant topic and check whether the information already belongs in a canonical source. Keep product behavior and terminology in [`docs/product/design-doc.md`](../docs/product/design-doc.md), approved feature details in their specifications, active work and its history in GitHub Issues and PRs, and verified technical behavior in the existing documentation or code. Link to those sources instead of copying them here. Keep routine progress in GitHub; do not capture every task.

Agents discover this guide through `AGENTS.md`, then search relevant terms in this directory and follow links to the canonical sources. When sources conflict, use the precedence in `AGENTS.md`; surface unresolved conflicts between still-valid approvals instead of choosing intent from a knowledge note or implementation drift.
