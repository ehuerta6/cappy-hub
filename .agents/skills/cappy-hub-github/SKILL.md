---
name: cappy-hub-github
description: Follow Cappy Hub's Git and GitHub workflow for repository changes, commits, pull requests, and merges. Use whenever preparing a branch, writing commit or PR metadata, or completing a PR.
---

# Cappy Hub GitHub workflow

Use this workflow for Cappy Hub changes. `README.md` is the contributor-facing reference; keep this skill aligned with its **Git & GitHub Workflow** section.

## Start work

1. Inspect the current branch, working tree, and any related pull request. Preserve existing user changes; never reset, discard, or overwrite work to make the checkout clean.
2. For new work, start from an updated `main`:

   ```sh
   git switch main
   git fetch --prune
   git pull
   ```

   `git fetch --prune` refreshes remote-tracking branches and removes references to branches deleted from GitHub. It does not delete local branches.

3. Create a short-lived branch from that updated `main`. Use a lowercase kebab-case name with one of these prefixes:
   - `feat/...` — feature, e.g. `feat/event-signups`
   - `fix/...` — bug fix
   - `chore/...` — maintenance
   - `docs/...` — documentation
   - `refactor/...` — restructuring

   Do not develop directly on `main`. For work that continues an existing branch or PR, inspect and continue that branch instead of creating a duplicate.

## Commits

- Keep commits focused and meaningful.
- Use conventional-style subjects: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, `refactor: ...`, or `ci: ...`.
- Do not force-push or rewrite shared `main` history. Do not commit `.env.local`, credentials, or secrets.

## Pull requests

Push the branch and open a PR targeting `main`. Use a conventional-style PR title, such as `feat: add event signups`.

Write a concise description with these headings:

```markdown
## Summary

## Changes

## Testing

## Notes
```

Include **Notes** only when useful. In **Testing**, state only checks and manual verification actually completed; distinguish local checks from GitHub CI.

Before merging, review the diff and run the repository checks:

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Wait for required GitHub checks to pass. Do not merge when a required check is failing. Report failures and fix issues caused by the change before proceeding.

## Merge and cleanup

When the user asks to merge, use **Squash and Merge**. Set the squash commit title to a clean conventional-style summary, normally matching the PR title. A request to open a PR by itself does not request a merge.

After merging, delete the remote branch, then synchronize the local checkout:

```sh
git switch main
git fetch --prune
git pull
```

If GitHub already deleted the branch during merge, `git fetch --prune` removes its stale remote-tracking reference. Never force-push or rewrite shared `main` history.
