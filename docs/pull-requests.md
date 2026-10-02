# Pull Requests

Every Pull Request should explain:

- The problem it solves
- What changed
- How it was tested
- Important implementation decisions

Use the repository's [Pull Request template](../.github/PULL_REQUEST_TEMPLATE.md). Confirm whether the database changes; if yes, include a migration and briefly describe changes to schema, RLS, RPCs, or other database behavior. Mark the checks you ran and report their outcomes.

Include screenshots when they help reviewers understand a UI change.

`main` is protected. Contributor PRs must pass CI, receive at least one approval, resolve review conversations, and be merged through a Pull Request. Do not force-push or rewrite shared `main` history.

Maintainers merge approved changes. The project uses **Squash and Merge** so each completed PR becomes one commit on `main`.
