# Development Workflow

## Start from the latest `main`

```bash
git switch main
git pull
```

## Create a branch

Do not develop directly on `main`. Use a short-lived branch with a relevant prefix:

```bash
git switch -c feat/event-filters
```

Common prefixes are `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`, and `ci/`.

Examples include `feat/officer-search`, `fix/event-signup-state`, and `docs/update-contributor-guide`.

## Make and check changes

Keep the change focused. If it changes the database, include its migration and corresponding application changes in the same PR. See [Database Development](database-development.md).

Before opening a PR, run:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

If formatting needs correction, run `npm run format` and review the resulting diff.

Some database tests require the local test stack:

```bash
npm run db:start
npm test
```

Do not use production data for development or testing.

## Commit and push

Use a short, meaningful commit message, for example `feat: add officer search`, `fix: prevent signup after event closes`, or `docs: improve contributor setup`.

```bash
git push -u origin feat/event-filters
```

Then open a Pull Request into `main`. See [Pull Requests](pull-requests.md) for review expectations.

## Keep a branch updated

If `main` changes while you work:

```bash
git switch main
git pull
git switch your-branch
git merge main
```

Resolve conflicts locally, rerun relevant checks, and push the branch.
