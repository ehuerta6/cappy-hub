# Preview verification

`Quality checks` runs application and database checks for PRs, including forks.
The separate `Contributor Preview verification` workflow checks the deployed
login page and publishes the `Preview verified` commit status on each current
open PR head.

## Contributor flow

1. Open a PR into `main`. Regular CI runs without production credentials.
2. For a fork, a maintainer reviews the code and authorizes its deployment from
   Vercel's PR comment when requested. Git Fork Protection remains enabled.
3. After deployment, verification checks `/login` over HTTPS. The response must
   be HTTP 200 with the Cappy Hub heading, club description, Google sign-in
   button, and the exact PR head revision.
4. `Preview verified` succeeds only after these assertions pass. A new push
   requires verification of its own commit.

A pending status means Vercel has not supplied a usable Preview yet; check its
authorization and build status. A failure links to the verification run. Review
its diagnostic and Vercel's build/runtime logs. This HTTP check does not log in
an Officer, exercise Task behavior, or prove database changes were deployed to a
hosted backend. CI checks database behavior using a disposable local database.

## Trusted execution and retries

The workflow runs from the default branch on Vercel `repository_dispatch`
deployment events, including `ready` and `success`, completion of PR CI, or a
maintainer's manual retry. It checks out `main` with persisted credentials
disabled, installs no dependencies, and never loads PR code or artifacts.

Events only wake the verifier. It reads current PR heads and deployment records
from GitHub, requires the Vercel bot and a non-production Preview, and accepts
only this project's immutable `cappy-<hash>-emiliano-huerta.vercel.app` hostname.
Other project hosts, branch aliases, URL credentials, paths, queries and
redirects are rejected. If the generated URL prefix or team slug changes, update
the allowlist and tests before moving verification.

Keep the existing `VERCEL_AUTOMATION_BYPASS_SECRET` repository secret configured
from Vercel's **Protection Bypass for Automation** setting. It is sent only to
the verified Preview in its bypass header; GitHub credentials go only to GitHub.
No Vercel deployment token or production credentials are needed.

Runs are serialized and reconcile all open PRs, so coalesced events do not lose
another PR's update. A successful GitHub Actions verification is reused only for
the same deployment, latest deployment-status ID and immutable URL. The verifier
checks those identities again before publishing success, so a redeploy during
the HTTP check leaves the status pending for fresh verification. CI completion recovers deployments that
finished before the PR opened. To retry delayed authorization or existing PRs,
use **Actions → Contributor Preview verification → Run workflow**, select `main`,
and run the workflow. Manual runs recheck all current Previews.

Unchanged results keep their existing status and run link instead of consuming
another status entry on each event. An unhealthy Preview remains failed while
being retried; recovery publishes success. A new deployment/status or URL is
checked as a new candidate. If GitHub rejects a PR's status publication, the
workflow reports the failure and continues checking the remaining PRs; its own
run fails overall rather than treating a publication error as verification.

## Activate the required status

The legacy `Preview runtime smoke / Verify Preview login` workflow remains
during rollout. It checks same-repository PRs only. Its skipped fork result does
not prove that the deployed login was checked: GitHub accepts skipped jobs as
satisfying a required check. The replacement is a distinct commit status.

1. Merge the verifier workflow into `main` after review and CI. Do not change
   branch protections before its trusted workflow exists on `main`.
2. Run **Contributor Preview verification** from `main` against open PRs. Confirm
   `Preview verified` is reported by GitHub Actions on the current head and links
   to successful HTTP verification. Exercise an authorized fork and a
   same-repository PR; unavailable Previews must remain pending and unhealthy
   Previews must fail.
3. In **Settings → Rules → Rulesets → Protect Main**, replace the required
   `Verify Preview login` check with `Preview verified`, selecting GitHub Actions
   as its source. Preserve `Quality checks`, approval and conversation-resolution
   requirements, and all other rules. Keep the legacy requirement until the
   replacement is proven. The reconciliation job itself is not the required
   status.
4. Confirm a new PR head cannot merge before `Preview verified` succeeds.

This rollout preserves Vercel fork authorization and deployment protection.
