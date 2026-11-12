import { describe, expect, it, vi } from "vitest";
import {
  createVercelProductionDeployment,
  DEPLOYMENT_TIMEOUT_MS,
  productionDeploymentRequest,
} from "../scripts/deploy-vercel-production.mjs";
import { isCurrentMainCommit } from "../scripts/check-production-main-tip.mjs";

const approvedSha = "a".repeat(40);
const advancedMainSha = "b".repeat(40);
const config = {
  token: "private-token",
  teamId: "team_example",
  projectId: "prj_example",
  repositoryId: "123456789",
  expectedSha: approvedSha,
};

function apiResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function readyDeployment(overrides = {}) {
  return {
    id: "dpl_example",
    readyState: "READY",
    target: "production",
    gitSource: { type: "github", ref: "main", sha: approvedSha },
    ...overrides,
  };
}

describe("production deployment gate", () => {
  it("skips a stale CI run when main has advanced before either gate", () => {
    expect(isCurrentMainCommit(approvedSha, approvedSha)).toBe(true);
    expect(isCurrentMainCommit(approvedSha, advancedMainSha)).toBe(false);
  });

  it("keeps the successful CI SHA when main advances after the final gate", async () => {
    let currentMain = approvedSha;
    expect(isCurrentMainCommit(approvedSha, currentMain)).toBe(true);
    currentMain = advancedMainSha;

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        apiResponse({ id: "dpl_example", readyState: "QUEUED" }),
      )
      .mockResolvedValueOnce(apiResponse(readyDeployment()));
    const log = vi.fn();

    await createVercelProductionDeployment(config, {
      fetchImpl,
      log,
    });

    const [url, options] = fetchImpl.mock.calls[0];
    const request = JSON.parse(String(options?.body));
    expect(String(url)).toBe(
      "https://api.vercel.com/v13/deployments?teamId=team_example",
    );
    expect(request).toEqual({
      name: "cappy-hub",
      project: "prj_example",
      target: "production",
      gitSource: {
        type: "github",
        repoId: "123456789",
        ref: "main",
        sha: approvedSha,
      },
    });
    expect(request.gitSource.sha).not.toBe(currentMain);
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer private-token",
    });
    expect(String(fetchImpl.mock.calls[1][0])).toBe(
      "https://api.vercel.com/v13/deployments/dpl_example?withGitRepoInfo=true&teamId=team_example",
    );
  });

  it("requires explicit full-SHA, repository, and project identity", () => {
    expect(
      productionDeploymentRequest({
        projectId: "prj_example",
        repositoryId: "123456789",
        expectedSha: approvedSha,
      }).gitSource.sha,
    ).toBe(approvedSha);
    expect(() =>
      productionDeploymentRequest({
        projectId: "",
        repositoryId: "123456789",
        expectedSha: approvedSha,
      }),
    ).toThrow("VERCEL_PROJECT_ID");
    expect(() =>
      productionDeploymentRequest({
        projectId: "prj_example",
        repositoryId: "repo",
        expectedSha: approvedSha,
      }),
    ).toThrow("VERCEL_REPOSITORY_ID");
    expect(() =>
      productionDeploymentRequest({
        projectId: "prj_example",
        repositoryId: "123456789",
        expectedSha: "main",
      }),
    ).toThrow("EXPECTED_DEPLOYMENT_SHA");
    expect(() => isCurrentMainCommit("main", advancedMainSha)).toThrow(
      "EXPECTED_DEPLOYMENT_SHA",
    );
  });

  it.each([
    [
      "wrong SHA",
      { gitSource: { type: "github", ref: "main", sha: advancedMainSha } },
    ],
    [
      "wrong branch",
      { gitSource: { type: "github", ref: "release", sha: approvedSha } },
    ],
    ["wrong target", { target: null }],
  ])("rejects a ready deployment with %s", async (_label, overrides) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        apiResponse({ id: "dpl_example", readyState: "QUEUED" }),
      )
      .mockResolvedValueOnce(apiResponse(readyDeployment(overrides)));
    await expect(
      createVercelProductionDeployment(config, { fetchImpl, log: vi.fn() }),
    ).rejects.toThrow(/does not match|not associated|did not target/);
  });

  it.each(["ERROR", "CANCELED"])("stops on a %s build", async (readyState) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        apiResponse({ id: "dpl_example", readyState: "QUEUED" }),
      )
      .mockResolvedValueOnce(apiResponse(readyDeployment({ readyState })));
    await expect(
      createVercelProductionDeployment(config, { fetchImpl, log: vi.fn() }),
    ).rejects.toThrow(`finished in ${readyState}`);
  });

  it("rejects missing deployment identity and avoids leaking request errors", async () => {
    const noId = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(apiResponse({ readyState: "QUEUED" }));
    await expect(
      createVercelProductionDeployment(config, {
        fetchImpl: noId,
        log: vi.fn(),
      }),
    ).rejects.toThrow("deployment ID");

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("request failed using private-token"));
    await expect(
      createVercelProductionDeployment(config, { fetchImpl, log: vi.fn() }),
    ).rejects.toThrow("could not be completed");
  });

  it("retries transient deployment polling failures", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        apiResponse({ id: "dpl_example", readyState: "QUEUED" }),
      )
      .mockResolvedValueOnce(apiResponse({ message: "temporary" }, 503))
      .mockResolvedValueOnce(apiResponse(readyDeployment()));
    const log = vi.fn();
    await expect(
      createVercelProductionDeployment(config, {
        fetchImpl,
        log,
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toMatchObject({ id: "dpl_example", state: "READY" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.flat().join("\n")).toContain(
      "polling temporarily failed",
    );
  });

  it("fails closed when deployment creation is rejected", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        apiResponse({ message: "private service details" }, 403),
      );
    await expect(
      createVercelProductionDeployment(config, { fetchImpl, log: vi.fn() }),
    ).rejects.toThrow("HTTP 403");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("times out when Vercel never reports readiness", async () => {
    let clock = 0;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        apiResponse({ id: "dpl_example", readyState: "QUEUED" }),
      )
      .mockImplementation(async () =>
        apiResponse({ id: "dpl_example", readyState: "BUILDING" }),
      );
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    await expect(
      createVercelProductionDeployment(config, {
        fetchImpl,
        now: () => clock,
        sleep,
        log: vi.fn(),
      }),
    ).rejects.toThrow(`within ${DEPLOYMENT_TIMEOUT_MS / 1000}s`);
    expect(fetchImpl).toHaveBeenCalledTimes(DEPLOYMENT_TIMEOUT_MS / 10_000 + 1);
  });
});
