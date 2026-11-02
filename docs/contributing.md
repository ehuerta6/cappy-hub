# Contributing

Contributions from CIC members are welcome. For a feature or larger change, open a GitHub Issue first so the problem and scope can be agreed before implementation.

Good contributions include bug fixes, usability and accessibility improvements, tests, documentation, small refactors, and work that improves an existing Cappy Hub workflow. Keep each change focused and avoid unrelated systems or features.

If you want to work on an existing Issue, leave a comment so multiple contributors do not duplicate the work.

## AI-assisted development

Follow the repository's [`AGENTS.md`](../AGENTS.md) for project requirements and workflow routing. Shared skills are committed under [`.agents/skills/`](../.agents/skills/). Codex discovers these project-local skills, so contributors do not need separate personal global installations. Read the relevant skill and linked project documentation before using a workflow.

Have an idea? Open an Issue describing the problem, what you think should change, and why it would improve Cappy Hub. You do not need to know the implementation in advance.

### Manual project-knowledge verification

Use this repeatable scenario when checking whether agent instructions make project knowledge discoverable:

1. In a fresh Codex or Claude session on an isolated branch based on current `main`, ask a concrete question about an approved decision (for example, whether Volunteer Time Slots remain active). Do not include the answer in the prompt. Confirm the agent points to the canonical Issue or specification and distinguishes approved intent from shipped behavior.
2. Ask about a decision already owned by an Issue or documentation (for example, the one-way Google Calendar mirror). Confirm the agent links that source and does not create a duplicate `knowledge/` note.
3. On the isolated branch, explicitly approve a new, non-sensitive, durable test decision. Ask the agent to capture it using the existing template, then start a separate fresh session and ask a question that requires retrieving it. Confirm the note includes its approval source and status and that the new session follows the source link. Discard the isolated branch after inspection.

This scenario checks retrieval and selective capture. Documentation changes alone do not show that an agent run passed; report agent behavior as unverified unless the scenario was actually run. Never use production data or credentials in this check.

## Issue hygiene

Before opening an Issue, search both open and closed Issues for the same requirement. Extend the canonical open Issue when the scope is genuinely the same. Create a new Issue when the requirement can be implemented independently or intentionally changes a settled product decision. Keep one canonical Issue responsible for one implementation scope.

For a true duplicate, close the duplicate with GitHub's duplicate reason when available and link the canonical Issue. Keep one acceptance-criteria list rather than maintaining parallel lists. When a newer decision supersedes an older one, leave the older Issue closed as historical evidence; link the newer Issue where practical and state which decision it supersedes.

After accepted behavior is implemented, update the Product & Technical Specification when it materially changes product behavior. Keep `docs/design.md` focused on visual and UI guidance; it does not define product semantics. The active Issue is the implementation boundary. Surface unrelated work separately instead of bundling nearby cleanup.
