# Agent skills

## Sources

The committed `.agents/skills/` directory is the source agents use in this repository. These files make Cappy Hub workflows available to contributors without requiring a personal global installation.

The reusable workflow skills listed below are adapted from [`ehuerta6/AI-ToolKit`](https://github.com/ehuerta6/AI-ToolKit). Cappy Hub's copies add project-specific requirements and remain authoritative for this repository. The latest source revision reviewed during the last synchronization is `d52e57d6d452ad90f30ac9488cdcd82d2d9bc6bd`.

| Cappy Hub skill       | AI-ToolKit source                     | Local responsibility                                                                                     |
| --------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `debug-with-evidence` | `skills/debug-with-evidence/SKILL.md` | Applies the reusable diagnosis process to Cappy Hub                                                      |
| `github-flow`         | `skills/github-flow/SKILL.md`         | Adds Cappy Hub's branch, PR, and merge rules                                                             |
| `grill-me`            | `skills/grill-me/SKILL.md`            | Preserves project terminology and durable-decision options                                               |
| `handoff`             | `skills/handoff/SKILL.md`             | Keeps handoffs grounded in Cappy Hub sources and state                                                   |
| `impeccable`          | `skills/impeccable/SKILL.md`          | Retains explicit viewport/state review for UI work; `SOURCE.md` documents its original Impeccable source |
| `implement-issue`     | `skills/implement-issue/SKILL.md`     | Adds the product source order, database/UI workflows, and Cappy Hub delivery rules                       |
| `issue-flow`          | `skills/issue-flow/SKILL.md`          | Applies Cappy Hub's issue and batch conventions                                                          |
| `project-knowledge`   | `skills/project-knowledge/SKILL.md`   | Connects the reusable workflow to Cappy Hub's capability slices                                          |
| `retro`               | `skills/retro/SKILL.md`               | Routes evidence-backed reusable findings to existing AI-ToolKit issues                                   |
| `review-pr`           | `skills/review-pr/SKILL.md`           | Adds exact-head, product-contract, database, and design review requirements                              |
| `to-issues`           | `skills/to-issues/SKILL.md`           | Creates issues compatible with Cappy Hub's templates and capability catalog                              |
| `to-spec`             | `skills/to-spec/SKILL.md`             | Connects approved specifications to Cappy Hub's capability catalog                                       |
| `verify-change`       | `skills/verify-change/SKILL.md`       | Uses Cappy Hub's configured checks and safe local database workflow                                      |
| `writing-for-agents`  | `skills/writing-for-agents/SKILL.md`  | Applies the reusable writing rules to project instructions                                               |

`cappy-knowledge`, `database-change`, and `local-database-workflow` are Cappy Hub-specific skills. `impeccable` also adapts the external [Impeccable project](https://github.com/pbakaus/impeccable); its `SOURCE.md` documents the original boundary.

## Synchronize reusable skills

Do not copy AI-ToolKit skills over the local files or use `npx skills update -g` to update them. Global CLI updates manage the user's installed global copies; they do not update these committed, project-adapted files. A wholesale overwrite would also discard Cappy Hub's product, security, database, and workflow requirements.

When AI-ToolKit changes:

1. Fetch its current `main` and compare only the mapped skill files against the pinned source revision above.
2. For each source change, classify it as reusable, already covered by Cappy Hub guidance, intentionally different, or irrelevant here.
3. Merge reusable improvements into the local skill while preserving project requirements and the source precedence in `AGENTS.md`. Keep the local diff understandable; do not duplicate a full skill just to record upstream wording.
4. Update the reviewed source revision in this document after the mapped skills have been reconciled. State meaningful intentional skips in the relevant skill or PR description.
5. Validate Markdown links and skill frontmatter, inspect the complete diff, and review the instructions against `AGENTS.md`, the owning docs, and the active issue/PR workflow.

For example, in a local AI-ToolKit clone, compare the old and new upstream snapshots with:

```sh
git -C ../AI-ToolKit fetch origin main
git -C ../AI-ToolKit diff <previous-source-revision>..origin/main -- skills/review-pr/SKILL.md skills/verify-change/SKILL.md
```

Then adapt the relevant changes in Cappy Hub's `.agents/skills/` and record `origin/main`'s resolved commit SHA here. If AI-ToolKit is not cloned alongside this repository, use a temporary clone or inspect the same commit range through GitHub before editing.
