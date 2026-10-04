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
npm run build
```

Before running the full `npm test` suite, use the migrations-only local database state:

```bash
npm run db:start
npm run db:reset
npm test
```

`db:start` does not reset rows. `db:reset` clears the local database and replays migrations without synthetic seed data, which is required by pgTAP fixtures. For interactive app development and Playwright, use `npm run local:reset` instead; that creates the separate seeded local app state. See [Local Database Workflow](../.ai/skills/local-database-workflow/SKILL.md) for state transitions and failure diagnosis.

If formatting needs correction, run `npm run format` and review the resulting diff.

Do not use production data for development or testing.

## Checks required to merge into `main`

The active **Protect Main** GitHub ruleset should require these exact status checks:

- `Quality checks` — includes the Playwright browser smoke suite.
- `Verify Preview login` — produced by the separate **Preview runtime smoke** workflow for same-repository PRs.

When either required check fails, GitHub blocks merging until it passes. Review the failed Actions run for details; a Playwright failure may also include a `playwright-results-<run id>` artifact. The current ruleset has no required checks configured yet. In **Settings → Rules → Protect Main**, add the two contexts above to its required status checks. Keep its existing pull request, review, conversation-resolution, force-push, and deletion protections in place.

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
