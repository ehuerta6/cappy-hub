import { afterEach, describe, expect, it, vi } from "vitest";
import {
  previewLoginUrl,
  waitForPreviewDeployment,
  verifyPreviewLogin,
  DEPLOYMENT_TIMEOUT_MS,
  RUNTIME_TIMEOUT_MS,
  RETRY_INTERVAL_MS,
} from "../scripts/verify-preview-deployment.mjs";

const sha = "a".repeat(40);
const origin = "https://cappy-abc123-emiliano-huerta.vercel.app";
const deployment = {
  id: 123,
  sha,
  environment: "Preview",
  production_environment: false,
  creator: { login: "vercel[bot]" },
};
const status = { state: "success", environment_url: origin };
const loginHtml = `<h1>Cappy Hub</h1><p>Coding Interview Club administration</p><button>Continue with Google</button>`;

function response(code: number, body = loginHtml) {
  return new Response(body, {
    status: code,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-cappy-hub-revision": sha,
    },
  });
}

afterEach(() => vi.useRealTimers());

describe("Preview deployment targeting", () => {
  it("uses the successful Vercel deployment's immutable URL and commit", () => {
    expect(previewLoginUrl(deployment, status, sha)).toBe(`${origin}/login`);
  });

  it.each([
    [{ ...deployment, sha: "b".repeat(40) }, status],
    [{ ...deployment, environment: "Production" }, status],
    [{ ...deployment, production_environment: true }, status],
    [deployment, { ...status, state: "pending" }],
    [deployment, { ...status, environment_url: "https://example.com" }],
    [deployment, { ...status, environment_url: `${origin}/admin` }],
  ])(
    "rejects unrelated or unsafe deployment data",
    (candidate, currentStatus) => {
      expect(() => previewLoginUrl(candidate, currentStatus, sha)).toThrow();
    },
  );

  it("waits for the matching Vercel Preview status", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([deployment]))
      .mockResolvedValueOnce(Response.json([status]));
    const pending = waitForPreviewDeployment(
      "ehuerta6/cappy-hub",
      sha,
      "test-token",
      { fetchImpl, log: vi.fn() },
    );
    await vi.runAllTimersAsync();
    expect(await pending).toBe(`${origin}/login`);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `https://api.github.com/repos/ehuerta6/cappy-hub/deployments?sha=${sha}&per_page=100`,
      `https://api.github.com/repos/ehuerta6/cappy-hub/deployments?sha=${sha}&per_page=100`,
      "https://api.github.com/repos/ehuerta6/cappy-hub/deployments/123/statuses?per_page=1",
    ]);
  });

  it("fails clearly if the matching deployment never becomes ready", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([]));
    const pending = expect(
      waitForPreviewDeployment("ehuerta6/cappy-hub", sha, "test-token", {
        fetchImpl,
        log: vi.fn(),
      }),
    ).rejects.toThrow("Vercel Preview was not ready");
    await vi.runAllTimersAsync();
    await pending;
    expect(performance.now()).toBe(DEPLOYMENT_TIMEOUT_MS);
  });
});

describe("Preview runtime smoke", () => {
  it("passes a healthy login page using only the Vercel bypass header", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(200));
    await verifyPreviewLogin(`${origin}/login`, sha, "bypass", {
      fetchImpl,
      log: vi.fn(),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${origin}/login`,
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({
      "x-vercel-protection-bypass": "bypass",
    });
    expect(fetchImpl.mock.calls[0][1]?.headers).not.toHaveProperty(
      "Authorization",
    );
  });

  it.each([
    [500, loginHtml, "HTTP=500"],
    [200, "<h1>Unrelated page</h1>", "expected content=false"],
  ])("fails a broken ready deployment", async (code, body, diagnostic) => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => response(code, body));
    const log = vi.fn();
    const pending = expect(
      verifyPreviewLogin(`${origin}/login`, sha, "bypass", { fetchImpl, log }),
    ).rejects.toThrow(diagnostic);
    await vi.runAllTimersAsync();
    await pending;
    expect(performance.now()).toBe(RUNTIME_TIMEOUT_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(
      RUNTIME_TIMEOUT_MS / RETRY_INTERVAL_MS,
    );
    expect(log.mock.calls.flat().join("\n")).toContain(`${origin}/login`);
    expect(log.mock.calls.flat().join("\n")).not.toContain("bypass");
  });

  it("fails before requesting protected Preview without a bypass secret", async () => {
    const fetchImpl = vi.fn();
    await expect(
      verifyPreviewLogin(`${origin}/login`, sha, "", { fetchImpl }),
    ).rejects.toThrow("VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
