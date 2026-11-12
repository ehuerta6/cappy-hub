import { pathToFileURL } from "node:url";

export const DEPLOYMENT_TIMEOUT_MS = 10 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 10 * 1000;
export const POLL_INTERVAL_MS = 10 * 1000;
const API_ORIGIN = "https://api.vercel.com";

export function productionDeploymentRequest({
  projectId,
  repositoryId,
  expectedSha,
}) {
  if (!projectId) throw new Error("VERCEL_PROJECT_ID is required.");
  if (!/^\d+$/.test(repositoryId ?? "")) {
    throw new Error(
      "VERCEL_REPOSITORY_ID must be a numeric GitHub repository ID.",
    );
  }
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? "")) {
    throw new Error("EXPECTED_DEPLOYMENT_SHA must be a full Git commit SHA.");
  }

  return {
    name: "cappy-hub",
    project: projectId,
    target: "production",
    gitSource: {
      type: "github",
      repoId: repositoryId,
      ref: "main",
      sha: expectedSha,
    },
  };
}

function deploymentUrl(deploymentId, teamId) {
  const url = new URL(
    `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    API_ORIGIN,
  );
  url.searchParams.set("withGitRepoInfo", "true");
  if (teamId) url.searchParams.set("teamId", teamId);
  return url;
}

function projectUrl(projectId, teamId) {
  const url = new URL(
    `/v9/projects/${encodeURIComponent(projectId)}`,
    API_ORIGIN,
  );
  if (teamId) url.searchParams.set("teamId", teamId);
  return url;
}

function promoteUrl(projectId, deploymentId, teamId) {
  const url = new URL(
    `/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(deploymentId)}`,
    API_ORIGIN,
  );
  if (teamId) url.searchParams.set("teamId", teamId);
  return url;
}

async function requestJson(url, { method, token, body, fetchImpl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Vercel API request failed with HTTP ${response.status}.`,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new Error("Vercel API returned an invalid JSON response.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Vercel API")) {
      throw error;
    }
    throw new Error(
      controller.signal.aborted
        ? "Vercel API request timed out."
        : "Vercel API request could not be completed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestPromotion(url, { token, fetchImpl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (![201, 202].includes(response.status)) {
      throw new Error(
        `Vercel promotion request failed with HTTP ${response.status}.`,
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Vercel promotion")
    ) {
      throw error;
    }
    throw new Error(
      controller.signal.aborted
        ? "Vercel promotion request timed out."
        : "Vercel promotion request could not be completed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateVercelProjectConfiguration(
  { token, teamId, projectId },
  { fetchImpl = fetch } = {},
) {
  if (!token) throw new Error("VERCEL_ACCESS_TOKEN is required.");
  if (!projectId) throw new Error("VERCEL_PROJECT_ID is required.");

  const project = await requestJson(projectUrl(projectId, teamId), {
    method: "GET",
    token,
    fetchImpl,
  });
  if (project.autoAssignCustomDomains !== false) {
    throw new Error(
      "Vercel project must disable Auto-assign Custom Production Domains before production deployment.",
    );
  }
}

function assertDeploymentIdentity(deployment, expectedSha, repositoryId) {
  const actualSha =
    deployment.gitSource?.sha ?? deployment.meta?.githubCommitSha;
  if (actualSha && actualSha !== expectedSha) {
    throw new Error(
      "Vercel deployment commit does not match the successful CI SHA.",
    );
  }

  const actualRef =
    deployment.gitSource?.ref ?? deployment.meta?.githubCommitRef;
  if (actualRef && actualRef !== "main") {
    throw new Error("Vercel deployment is not associated with main.");
  }

  const actualRepositoryId = deployment.gitSource?.repoId;
  if (
    actualRepositoryId !== undefined &&
    String(actualRepositoryId) !== repositoryId
  ) {
    throw new Error(
      "Vercel deployment repository does not match the intended GitHub repository.",
    );
  }

  if (deployment.readyState === "READY") {
    if (actualSha !== expectedSha) {
      throw new Error("Vercel did not confirm the successful CI commit SHA.");
    }
    if (actualRepositoryId === undefined) {
      throw new Error(
        "Vercel did not confirm the intended GitHub repository ID.",
      );
    }
    if (actualRef !== "main") {
      throw new Error("Vercel did not confirm the main branch ref.");
    }
    if (deployment.target !== "production") {
      throw new Error("Vercel deployment did not target production.");
    }
    if (deployment.aliasAssigned !== false) {
      throw new Error(
        "Vercel production deployment was assigned an alias before verification.",
      );
    }
  } else if (deployment.aliasAssigned === true) {
    throw new Error(
      "Vercel production deployment was assigned an alias before verification.",
    );
  }
}

export async function createVercelProductionDeployment(
  { token, teamId, projectId, repositoryId, expectedSha },
  {
    fetchImpl = fetch,
    now = () => performance.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = console.log,
  } = {},
) {
  if (!token) throw new Error("VERCEL_ACCESS_TOKEN is required.");
  await validateVercelProjectConfiguration(
    { token, teamId, projectId },
    { fetchImpl },
  );
  const body = productionDeploymentRequest({
    projectId,
    repositoryId,
    expectedSha,
  });
  const query = new URLSearchParams();
  if (teamId) query.set("teamId", teamId);
  const endpoint = new URL("/v13/deployments", API_ORIGIN);
  endpoint.search = query.toString();

  const created = await requestJson(endpoint, {
    method: "POST",
    token,
    body,
    fetchImpl,
  });
  if (typeof created.id !== "string" || !created.id) {
    throw new Error("Vercel did not return a deployment ID.");
  }
  if (created.aliasAssigned !== false) {
    throw new Error(
      "Vercel did not confirm that the production deployment is staged without aliases.",
    );
  }
  log(`Created Vercel production deployment ${created.id} for ${expectedSha}.`);

  const deadline = now() + DEPLOYMENT_TIMEOUT_MS;
  let state = created.readyState;
  let deployment = created;
  let lastPollingError;
  while (now() < deadline) {
    try {
      deployment = await requestJson(deploymentUrl(created.id, teamId), {
        method: "GET",
        token,
        fetchImpl,
      });
      lastPollingError = undefined;
    } catch (error) {
      const retryable =
        /HTTP (408|425|429|5\d\d)|timed out|could not be completed/.test(
          error.message,
        );
      if (!retryable) throw error;
      lastPollingError = error.message;
      log(`Vercel deployment ${created.id}: polling temporarily failed.`);
      const remaining = deadline - now();
      if (remaining > 0) await sleep(Math.min(POLL_INTERVAL_MS, remaining));
      continue;
    }
    state = deployment.readyState;
    if (typeof state !== "string") {
      throw new Error(
        "Vercel deployment response is missing its readiness state.",
      );
    }
    assertDeploymentIdentity(deployment, expectedSha, repositoryId);
    log(`Vercel deployment ${created.id}: ${state}.`);

    if (state === "READY") {
      await requestPromotion(promoteUrl(projectId, created.id, teamId), {
        token,
        fetchImpl,
      });
      log(
        "Verified Vercel production deployment was promoted; running the HTTP revision smoke check.",
      );
      return { id: created.id, state, promoted: true };
    }
    if (["ERROR", "CANCELED"].includes(state)) {
      throw new Error(`Vercel production deployment finished in ${state}.`);
    }

    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }

  throw new Error(
    `Vercel production deployment did not become ready within ${DEPLOYMENT_TIMEOUT_MS / 1000}s (last state: ${state ?? "unknown"}${lastPollingError ? `; ${lastPollingError}` : ""}).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const config = {
      token: process.env.VERCEL_ACCESS_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
      repositoryId: process.env.VERCEL_REPOSITORY_ID,
      expectedSha: process.env.EXPECTED_DEPLOYMENT_SHA,
    };
    if (process.argv.includes("--check-project")) {
      await validateVercelProjectConfiguration(config);
      console.log(
        "Vercel project is configured for staged production deploys.",
      );
    } else {
      await createVercelProductionDeployment(config);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
