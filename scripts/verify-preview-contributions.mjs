import { pathToFileURL } from "node:url";
import {
  previewLoginUrl,
  verifyPreviewLogin,
  REQUEST_TIMEOUT_MS,
} from "./verify-preview-deployment.mjs";

export const PREVIEW_STATUS_CONTEXT = "Preview verified";

// This project's immutable URLs use cappy-<hash>-emiliano-huerta.vercel.app.
// Branch aliases and other projects must never receive the bypass credential.
const previewHostname = /^cappy-[a-z0-9]+-emiliano-huerta\.vercel\.app$/;

export async function verifyContributionPreviews({
  repository,
  token,
  bypassSecret,
  runUrl,
  force = false,
  fetchImpl = fetch,
  log = console.log,
}) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") ||
    !token ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(
      runUrl ?? "",
    ) ||
    !runUrl.startsWith(`https://github.com/${repository}/actions/runs/`)
  ) {
    throw new Error("Invalid repository, run URL, or token.");
  }

  async function github(path, body) {
    let response;
    try {
      response = await fetchImpl(
        `https://api.github.com/repos/${repository}${path}`,
        {
          method: body ? "POST" : "GET",
          redirect: "error",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      throw new Error("GitHub Preview verification API request failed.");
    }
    if (!response.ok) {
      throw new Error(
        `GitHub Preview verification API returned HTTP ${response.status}.`,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new Error("GitHub Preview verification API returned invalid JSON.");
    }
  }

  async function latestPreview(sha) {
    const deployments = await github(`/deployments?sha=${sha}&per_page=100`);
    if (!Array.isArray(deployments))
      throw new Error("GitHub returned an invalid deployment list.");
    const deployment = deployments
      .filter(
        (candidate) =>
          candidate.sha === sha &&
          candidate.environment === "Preview" &&
          candidate.production_environment === false &&
          candidate.creator?.login === "vercel[bot]" &&
          Number.isSafeInteger(candidate.id) &&
          candidate.id > 0,
      )
      .sort(
        (a, b) =>
          Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id,
      )[0];
    if (!deployment) return {};
    const statuses = await github(
      `/deployments/${deployment.id}/statuses?per_page=1`,
    );
    if (!Array.isArray(statuses))
      throw new Error("GitHub returned an invalid deployment status list.");
    return { deployment, status: statuses[0] };
  }

  async function latestVerification(sha) {
    for (let page = 1; ; page += 1) {
      const batch = await github(
        `/commits/${sha}/statuses?per_page=100&page=${page}`,
      );
      if (!Array.isArray(batch))
        throw new Error("GitHub returned an invalid commit status list.");
      const previous = batch.find(
        (entry) =>
          entry.context?.toLowerCase() === PREVIEW_STATUS_CONTEXT.toLowerCase(),
      );
      if (previous || batch.length < 100) return previous;
    }
  }

  const pulls = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(
      `/pulls?state=open&base=main&per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch))
      throw new Error("GitHub returned an invalid pull request list.");
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  const selected = pulls.filter(
    (pull) =>
      pull.state === "open" &&
      pull.base?.ref === "main" &&
      pull.base?.repo?.full_name === repository &&
      /^[a-f0-9]{40}$/.test(pull.head?.sha ?? "") &&
      Number.isSafeInteger(pull.number) &&
      pull.number > 0,
  );

  const results = [];
  for (const pull of selected) {
    const sha = pull.head.sha;
    let previous;
    let publicationFailed = false;
    let failureDescription =
      "Preview verification failed; inspect the verification run.";
    function matchesPrevious(state, description) {
      return (
        previous?.creator?.login === "github-actions[bot]" &&
        previous.state === state &&
        previous.description === description
      );
    }
    async function publish(state, description) {
      try {
        // A push or merge during the HTTP check must not approve the new revision.
        const current = await github(`/pulls/${pull.number}`);
        if (
          current.state !== "open" ||
          current.head?.sha !== sha ||
          current.base?.ref !== "main" ||
          current.base?.repo?.full_name !== repository
        )
          return false;
        // A new run URL alone is not a changed result. GitHub caps this context
        // at 1,000 writes per SHA, including unchanged pending/failure states.
        if (matchesPrevious(state, description)) return true;
        previous = await github(`/statuses/${sha}`, {
          context: PREVIEW_STATUS_CONTEXT,
          state,
          description,
          target_url: runUrl,
        });
        return true;
      } catch (error) {
        publicationFailed = true;
        throw error;
      }
    }

    try {
      previous = await latestVerification(sha);
      const { deployment, status } = await latestPreview(sha);
      if (!deployment) {
        await publish(
          "pending",
          "Awaiting Vercel Preview; authorize the fork deployment if requested.",
        );
        results.push({ number: pull.number, state: "pending" });
        continue;
      }
      if (
        !status ||
        ["pending", "queued", "in_progress"].includes(status.state)
      ) {
        await publish(
          "pending",
          "Waiting for the current Vercel Preview deployment to finish.",
        );
        results.push({ number: pull.number, state: "pending" });
        continue;
      }
      if (status.state !== "success")
        throw new Error(
          "The latest Vercel Preview deployment did not succeed.",
        );
      if (
        status.creator?.login !== "vercel[bot]" ||
        !Number.isSafeInteger(status.id) ||
        status.id <= 0
      )
        throw new Error("The Preview status was not published by Vercel.");
      const url = previewLoginUrl(deployment, status, sha);
      if (!previewHostname.test(new URL(url).hostname)) {
        throw new Error(
          "The Preview URL is not this project's immutable deployment hostname.",
        );
      }
      // Vercel can reuse one GitHub deployment for multiple immutable URLs.
      const identity = `${deployment.id}/${status.id} ${new URL(url).hostname}`;
      const description = `Login verified: ${identity}.`;
      failureDescription = `Preview verification failed: ${identity}.`;
      if (!force && matchesPrevious("success", description)) {
        results.push({ number: pull.number, state: "success" });
        continue;
      }
      // Keep a failed candidate red during retries instead of appending a new
      // pending/failure pair on every event. Recovery still publishes success.
      const retryingFailure = matchesPrevious("failure", failureDescription);
      if (
        !(await publish(
          retryingFailure ? "failure" : "pending",
          retryingFailure
            ? failureDescription
            : "Checking the login page of the current Vercel Preview.",
        ))
      )
        continue;
      await verifyPreviewLogin(url, sha, bypassSecret, { fetchImpl, log });
      const latest = await latestPreview(sha);
      if (
        latest.deployment?.id !== deployment.id ||
        latest.status?.id !== status.id ||
        latest.status?.state !== "success" ||
        latest.status?.environment_url !== status.environment_url ||
        latest.status?.creator?.login !== "vercel[bot]"
      ) {
        await publish(
          "pending",
          "Preview changed during verification; waiting for a fresh check.",
        );
        results.push({ number: pull.number, state: "pending" });
        continue;
      }
      if (await publish("success", description)) {
        results.push({ number: pull.number, state: "success" });
      }
    } catch (error) {
      log(`PR #${pull.number}: ${error.message}`);
      // A rejected publication cannot be repaired by posting another state to
      // the same SHA. Report it without letting one PR abort the entire scan.
      if (!publicationFailed) {
        try {
          await publish("failure", failureDescription);
        } catch (publicationError) {
          log(`PR #${pull.number}: ${publicationError.message}`);
        }
      }
      results.push({ number: pull.number, state: "failure" });
    }
  }
  log(
    `Preview verification: ${results.map(({ number, state }) => `#${number} ${state}`).join(", ") || "no current open PRs"}.`,
  );
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const results = await verifyContributionPreviews({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      runUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      force: process.env.GITHUB_EVENT_NAME === "workflow_dispatch",
    });
    if (results.some(({ state }) => state === "failure")) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
