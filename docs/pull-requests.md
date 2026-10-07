# Pull Requests

Every Pull Request should explain:

- The problem it solves
- What changed
- How it was tested
- Important implementation decisions

Use the repository's [Pull Request template](../.github/PULL_REQUEST_TEMPLATE.md). Confirm whether the database changes; if yes, include a migration and briefly describe changes to schema, RLS, RPCs, or other database behavior. Mark the checks you ran and report their outcomes.

Include screenshots when they help reviewers understand a UI change.

`main` is protected. Contributor PRs must pass CI, receive at least one approval, resolve review conversations, and be merged through a Pull Request. Do not force-push or rewrite shared `main` history.

Vercel automatically builds a Preview for PR commits. The separate **Preview runtime smoke / Verify Preview login** check runs on same-repository PRs into `main`. It waits up to ten minutes for Vercel's successful GitHub **Preview** deployment status for the exact PR head commit, then requests that deployment's immutable `/login` URL. It requires HTTP 200, the Cappy Hub heading, club description, Google sign-in button, and the deployed commit revision. The runtime request retries for up to 90 seconds. Failure output identifies the URL, HTTP status or deployment-not-ready state, and failed assertion. A Vercel **Ready** status alone does not prove the page works.

Keep Vercel's GitHub integration and automatic Preview deployments enabled. In the Vercel project's Deployment Protection settings, create a dedicated **Protection Bypass for Automation** secret and save its value as the GitHub repository Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET`. This permits the check to reach the protected Preview without opening it to the public. Vercel system environment variables must also provide `VERCEL_GIT_COMMIT_SHA` for the revision header. The check reads deployment status through GitHub's read-only token; it needs no Vercel API token. Fork PRs skip this secret-bearing job. The check makes no Officer login or database write. The local Playwright suite covers browser workflows against disposable Supabase data; the production smoke checks the canonical production URL after migration and deployment.

Maintainers merge approved changes. The repository allows **Squash and Merge** only; merge commits and rebase merging are disabled. Each completed PR becomes one commit on `main`.
