# Agent skills

## Sources

The committed `.agents/skills/` directory is the source agents use in this repository. These files make Cappy Hub workflows available to contributors without requiring a personal global installation.

The 13 reusable workflow skills listed below are adapted from [`ehuerta6/AI-ToolKit`](https://github.com/ehuerta6/AI-ToolKit). Cappy Hub's copies add project-specific requirements and remain authoritative for this repository. The latest source revision reviewed during the last synchronization is `d52e57d6d452ad90f30ac9488cdcd82d2d9bc6bd`.

| Cappy Hub skill       | AI-ToolKit source                     | Local responsibility                                                               |
| --------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| `debug-with-evidence` | `skills/debug-with-evidence/SKILL.md` | Applies the reusable diagnosis process to Cappy Hub                                |
| `github-flow`         | `skills/github-flow/SKILL.md`         | Adds Cappy Hub's branch, PR, and merge rules                                       |
| `grill-me`            | `skills/grill-me/SKILL.md`            | Preserves project terminology and durable-decision options                         |
| `handoff`             | `skills/handoff/SKILL.md`             | Keeps handoffs grounded in Cappy Hub sources and state                             |
| `implement-issue`     | `skills/implement-issue/SKILL.md`     | Adds the product source order, database/UI workflows, and Cappy Hub delivery rules |
| `issue-flow`          | `skills/issue-flow/SKILL.md`          | Applies Cappy Hub's issue and batch conventions                                    |
| `project-knowledge`   | `skills/project-knowledge/SKILL.md`   | Connects the reusable workflow to Cappy Hub's capability slices                    |
| `retro`               | `skills/retro/SKILL.md`               | Routes evidence-backed reusable findings to existing AI-ToolKit issues             |
| `review-pr`           | `skills/review-pr/SKILL.md`           | Adds exact-head, product-contract, database, and design review requirements        |
| `to-issues`           | `skills/to-issues/SKILL.md`           | Creates issues compatible with Cappy Hub's templates and capability catalog        |
| `to-spec`             | `skills/to-spec/SKILL.md`             | Connects approved specifications to Cappy Hub's capability catalog                 |
| `verify-change`       | `skills/verify-change/SKILL.md`       | Uses Cappy Hub's configured checks and safe local database workflow                |
| `writing-for-agents`  | `skills/writing-for-agents/SKILL.md`  | Applies the reusable writing rules to project instructions                         |

`cappy-knowledge`, [`cappy-google-calendar-review`](../.agents/skills/cappy-google-calendar-review/SKILL.md), `database-change`, and `local-database-workflow` are Cappy Hub-specific skills. `impeccable` is separately maintained as an adaptation of the external [Impeccable project](https://github.com/pbakaus/impeccable), documented in its `SOURCE.md`. It was compared with AI-ToolKit's same-name skill during this review; its local viewport/state verification guidance remains intentionally in place.

## Project-specific Codex agents

The `.codex/agents/` directory contains two Cappy Hub-only Codex subagents, adapted from AI-ToolKit's [`pr-reviewer`](https://github.com/ehuerta6/AI-ToolKit/blob/d52e57d6d452ad90f30ac9488cdcd82d2d9bc6bd/agents/pr-reviewer.md) and [`supabase-database-reviewer`](https://github.com/ehuerta6/AI-ToolKit/blob/d52e57d6d452ad90f30ac9488cdcd82d2d9bc6bd/agents/supabase-database-reviewer.md). Their instructions are grounded in Cappy Hub's review skills, contracts, and database workflow:

- [`cappy-pr-reviewer.toml`](../.codex/agents/cappy-pr-reviewer.toml) reviews a specified PR revision against the linked Issue, Cappy Hub contracts, and exact-head checks.
- [`cappy-database-reviewer.toml`](../.codex/agents/cappy-database-reviewer.toml) adds a focused review for Supabase/PostgreSQL changes, including migrations, RLS, RPC permissions, generated types, history, and upgrade compatibility.

They are optional analysis tools and review-only by instruction; Codex agents inherit the parent session's permissions. Their TOML files are validated in this change; runtime discovery by a local Codex installation has not been smoke-tested. Their findings do not count as formal GitHub approvals, replace required CI, or authorize merging. Do not add generic agents where an existing skill or built-in workflow already covers the job.

## Synchronize reusable skills

Do not copy AI-ToolKit skills over the local files or use `npx skills update -g` as a synchronization step. The Skills CLI updates skills installed and tracked by that CLI; it does not reconcile this repository's 13 committed, project-adapted files with their upstream source. A wholesale overwrite would also discard Cappy Hub's product, security, database, and workflow requirements. See the [Skills CLI documentation](https://www.skills.sh/docs/cli).

When AI-ToolKit changes:

1. Fetch its current `main` and compare only the mapped skill files against the pinned source revision above.
2. For each source change, classify it as reusable, already covered by Cappy Hub guidance, intentionally different, or irrelevant here.
3. Merge reusable improvements into the local skill while preserving project requirements and the source precedence in `AGENTS.md`. Keep the local diff understandable; do not duplicate a full skill just to record upstream wording.
4. Update the reviewed source revision in this document after the mapped skills have been reconciled. State meaningful intentional skips in the relevant skill or PR description.
5. Validate Markdown links and skill frontmatter, inspect the complete diff, and review the instructions against `AGENTS.md`, the owning docs, and the active issue/PR workflow.

When adding a project-local Codex agent, place its TOML definition in `.codex/agents/`, keep it scoped to a real Cappy Hub review gap, and route it to the canonical project skills and docs. Validate the TOML and check that its role does not duplicate another agent or turn its report into an approval.

For example, in a local AI-ToolKit clone, compare the old and new upstream snapshots with:

```sh
git -C ../AI-ToolKit fetch origin main
git -C ../AI-ToolKit diff <previous-source-revision>..origin/main -- skills/review-pr/SKILL.md skills/verify-change/SKILL.md
```

Then adapt the relevant changes in Cappy Hub's `.agents/skills/` and record `origin/main`'s resolved commit SHA here. If AI-ToolKit is not cloned alongside this repository, use a temporary clone or inspect the same commit range through GitHub before editing.
