import { pathToFileURL } from "node:url";
import { interpretResponse } from "./verify-production-deployment.mjs";

export const DEPLOYMENT_TIMEOUT_MS = 10 * 60 * 1000;
export const RUNTIME_TIMEOUT_MS = 90 * 1000;
export const RETRY_INTERVAL_MS = 10 * 1000;
export const REQUEST_TIMEOUT_MS = 10 * 1000;

export function previewLoginUrl(deployment, status, expectedSha) {
  if (
    deployment?.sha !== expectedSha ||
    deployment?.environment !== "Preview" ||
    deployment?.production_environment !== false ||
    deployment?.creator?.login !== "vercel[bot]" ||
    status?.state !== "success"
  ) {
    throw new Error(
      "Expected a successful Vercel Preview deployment for this commit.",
    );
  }
  let url;
  try {
    url = new URL(status.environment_url);
  } catch {
    throw new Error("Vercel Preview deployment status has no valid URL.");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".vercel.app") ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Vercel Preview deployment status has no valid URL.");
  }
  return new URL("/login", url).href;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubJson(path, token, fetchImpl) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub deployment API returned HTTP ${response.status}.`);
  }
  return response.json();
}

export async function waitForPreviewDeployment(
  repository,
  expectedSha,
  token,
  { fetchImpl = fetch, log = console.log } = {},
) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") ||
    !/^[a-f0-9]{40}$/.test(expectedSha ?? "") ||
    !token
  ) {
    throw new Error(
      "Missing or invalid GitHub repository, PR commit SHA, or token.",
    );
  }
  const deadline = performance.now() + DEPLOYMENT_TIMEOUT_MS;
  let lastResult = "No matching Vercel Preview deployment found.";
  log(`Waiting for Vercel Preview deployment of ${repository}@${expectedSha}.`);
  while (performance.now() < deadline) {
    try {
      const deployments = await githubJson(
        `/repos/${repository}/deployments?sha=${expectedSha}&per_page=100`,
        token,
        fetchImpl,
      );
      const matchingDeployments = deployments
        .filter(
          (deployment) =>
            deployment.sha === expectedSha &&
            deployment.environment === "Preview" &&
            deployment.production_environment === false &&
            deployment.creator?.login === "vercel[bot]",
        )
        .sort((a, b) => b.created_at - a.created_at);
      const deployment = matchingDeployments[0];
      if (deployment) {
        const statuses = await githubJson(
          `/repos/${repository}/deployments/${deployment.id}/statuses?per_page=1`,
          token,
          fetchImpl,
        );
        const status = statuses[0];
        lastResult = `deployment ${deployment.id}: ${status?.state ?? "no status"}`;
        if (status?.state === "success") {
          const url = previewLoginUrl(deployment, status, expectedSha);
          log(`Vercel Preview is ready: ${url}.`);
          return url;
        }
        if (["error", "failure"].includes(status?.state)) {
          throw new Error(
            `Vercel Preview ${lastResult}. Inspect Vercel build logs.`,
          );
        }
      }
    } catch (error) {
      if (
        error.message.startsWith("Vercel Preview deployment ") ||
        error.message.startsWith("Expected a successful Vercel Preview")
      ) {
        throw error;
      }
      // Do not print raw API or network errors; they may contain credentials.
      lastResult = error.message.startsWith(
        "GitHub deployment API returned HTTP ",
      )
        ? error.message
        : "GitHub deployment API request failed.";
    }
    await wait(
      Math.min(RETRY_INTERVAL_MS, Math.max(0, deadline - performance.now())),
    );
  }
  throw new Error(
    `Vercel Preview was not ready after ${DEPLOYMENT_TIMEOUT_MS / 1000}s for ${repository}@${expectedSha}. Last result: ${lastResult}.`,
  );
}

export async function verifyPreviewLogin(
  url,
  expectedSha,
  bypassSecret,
  { fetchImpl = fetch, log = console.log } = {},
) {
  if (!bypassSecret) {
    throw new Error(
      "VERCEL_AUTOMATION_BYPASS_SECRET is required for protected Preview deployments.",
    );
  }
  const deadline = performance.now() + RUNTIME_TIMEOUT_MS;
  let attempt = 0;
  let lastResult = "No response received.";
  while (performance.now() < deadline) {
    attempt += 1;
    let httpStatus = "unavailable";
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(REQUEST_TIMEOUT_MS, deadline - performance.now()),
    );
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "text/html",
          "Cache-Control": "no-cache",
          "x-vercel-protection-bypass": bypassSecret,
        },
        signal: controller.signal,
      });
      httpStatus = String(response.status);
      const result = interpretResponse(
        response.status,
        response.headers,
        await response.text(),
        expectedSha,
      );
      lastResult = `HTTP=${httpStatus}, expected content=${result.contentFound}, HTML=${result.isHtml}, expected revision=${result.revisionMatches}`;
      log(`${url} attempt ${attempt}: ${lastResult}.`);
      if (result.ok && performance.now() < deadline) {
        log("Preview runtime smoke passed.");
        return;
      }
    } catch {
      lastResult = `HTTP=${httpStatus}, ${controller.signal.aborted ? "request timed out" : "request or response body failed"}`;
      log(`${url} attempt ${attempt}: ${lastResult}.`);
    } finally {
      clearTimeout(timer);
    }
    await wait(
      Math.min(RETRY_INTERVAL_MS, Math.max(0, deadline - performance.now())),
    );
  }
  throw new Error(
    `Preview runtime smoke failed after ${RUNTIME_TIMEOUT_MS / 1000}s checking ${url} (${attempt} attempts). Last result: ${lastResult}. Inspect Vercel Preview runtime logs and Preview environment variables.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const url = await waitForPreviewDeployment(
      process.env.GITHUB_REPOSITORY,
      process.env.EXPECTED_DEPLOYMENT_SHA,
      process.env.GITHUB_TOKEN,
    );
    await verifyPreviewLogin(
      url,
      process.env.EXPECTED_DEPLOYMENT_SHA,
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
