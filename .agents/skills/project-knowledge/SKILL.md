---
name: project-knowledge
description: Use when retrieving, recording, reconciling, or reviewing durable project decisions, constraints, rationale, and context in a repository's knowledge/ files.
---

# Project knowledge

Use this workflow when project knowledge can materially help the current task, when the user asks to preserve an approved decision, or when the user explicitly requests a Knowledge Review. Do not create a note for every issue, pull request, or routine change.

## Sources and retrieval

Keep these sources distinct:

- GitHub Issues and pull requests track active work and its history.
- `knowledge/` preserves durable decisions, rationale, constraints, and context.
- `docs/` describes the product and verified behavior.
- Code is evidence of current implementation, not approval of product intent.

If `knowledge/README.md` exists, read it first. Search only for the current task's concepts and inspect the relevant notes, using native repository search such as `rg -n -i '<terms>' knowledge/`. Follow links to canonical issues, pull requests, code, and documentation. Do not load or mirror unrelated history.

## Capture

Record knowledge when it is likely to change a future decision or prevent repeated investigation. Suitable content includes explicitly approved decisions, durable constraints, architectural rationale, and verified lessons. Keep routine task progress in GitHub.

Before writing, check whether the information already belongs in a canonical project source or an existing note. Link to that source instead of copying its contents. Do not copy credentials, secrets, private data, or entire issue and pull request histories.

For a decision, use `templates/DECISION.md` when available. Otherwise use plain Markdown with a descriptive filename and clearly state its status, context, decision, rationale, evidence, consequences, and any decision it replaces. Link to the approval source. Label approved future intent separately from implemented behavior; update `docs/` only when behavior is verified.

## Reconcile and maintain

When notes conflict or appear stale, compare them with newer explicit approvals, project instructions, current code, official docs, and relevant GitHub records. Check whether the older note was an approved decision or historical record before changing it.

- If a clear, newer explicit approval supersedes an older decision, mark the older decision as superseded and link the newer source. Preserve important history.
- If the conflict is about current implementation, correct factual context only when current evidence is clear; do not treat implementation drift as cancellation of an approved target decision.
- If multiple approved decisions remain plausibly current, or resolving the conflict would choose product or architecture intent, explain the conflict, show meaningful options and a grounded recommendation, then ask one concise question. Do not choose for the user.
- Consolidate duplicate notes by preserving unique evidence and links. Remove an important historical record only with the user's authority.

Keep statuses clear: approved future decision, current implemented behavior, historical decision, or unresolved proposal. Agents may maintain evidence-backed technical context and routine note hygiene autonomously, but may not approve product or architecture choices, resolve genuine ambiguity, or remove important history without user authority. Existing explicit approval is sufficient; do not ask for it twice.

If important possible contradictions surface during ordinary work, offer a focused review instead of starting one. For example: “Encontré tres decisiones que podrían estar desactualizadas. ¿Quieres que revisemos cuáles siguen vigentes?”

## Knowledge Review

Run this mode only when the user explicitly asks to review project knowledge. Read the knowledge guide, search and inspect relevant notes, then compare them with current repository evidence. Report potential staleness, contradictions, duplication, and context that may no longer apply. Distinguish evidence from inference and keep uncertain decisions open for the user. Do not assume age or implementation drift makes a decision wrong.

## Adoption and discovery

For an existing project, inspect its current instructions, knowledge files, and documentation before recommending changes. Classify each relevant change as `ADD`, `KEEP EXISTING`, `REPLACE`, or `SKIP`. Preserve project-specific behavior. Do not add `knowledge/` unconditionally or replace existing instructions or documentation without approval. Create only useful files; do not create empty folders to match a preferred tree.

Use `knowledge/README.md` as the concise guide to the project's knowledge sources and links. Add a short pointer from the project's existing agent instructions to that guide and this skill when adopted. Codex recognizes `AGENTS.md`. Claude Code's `AGENTS.md` support depends on version and project instruction settings. Check which files the current setup loads: if Claude reads `AGENTS.md`, no adapter is needed; if a `CLAUDE.md` is the loaded project instruction, put the pointer there. When `CLAUDE.md` must include shared `AGENTS.md` guidance, use its `@AGENTS.md` import rather than relying on a prose pointer to load the file. If an adapter is needed, preserve existing `CLAUDE.md` content and propose only the minimal addition. The same skill can be installed for Claude Code under `.claude/skills/` or `~/.claude/skills/`; do not maintain a second authored copy.

## Completion

For retrieval, cite the notes and sources used. For edits, check links and status labels, confirm no canonical source was copied, and report what changed. For Knowledge Review, report evidence and unresolved choices without silently rewriting ambiguous or historically important decisions.
