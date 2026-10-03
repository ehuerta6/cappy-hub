import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import {
  interpretResponse,
  productionLoginUrl,
  verifyProductionDeployment,
  TIMEOUT_MS,
  RETRY_INTERVAL_MS,
  REQUEST_TIMEOUT_MS,
} from "../scripts/verify-production-deployment.mjs";

const revision = "a".repeat(40);
const origin = "https://cappy.example";
const loginHtml = `<html><body>
  <h1 class="heading">Cappy Hub</h1>
  <p> Coding Interview Club administration </p>
  <button type="button">Continue with Google</button>
</body></html>`;

function response(status = 200, body = loginHtml, sha = revision) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-cappy-hub-revision": sha,
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("production deployment response", () => {
  it("accepts the rendered login surface from the expected revision", () => {
    const result = interpretResponse(
      200,
      response().headers,
      loginHtml,
      revision,
    );
    expect(result).toEqual({
      contentFound: true,
      revisionMatches: true,
      isHtml: true,
      ok: true,
    });
  });

  it.each([302, 401, 403, 404, 500, 503])("rejects HTTP %s", (status) => {
    expect(
      interpretResponse(status, response().headers, loginHtml, revision).ok,
    ).toBe(false);
  });

  it.each([
    "<h1>DEPLOYMENT_NOT_FOUND</h1>",
    "<h1>Vercel Security Checkpoint</h1>",
    "<h1>Welcome to Next.js</h1>",
    "<title>Cappy Hub</title><p>Application error: a server-side exception has occurred</p>",
    `<script>${loginHtml}</script>`,
    `<!-- ${loginHtml} -->`,
    loginHtml.replace("Continue with Google", "Local development accounts"),
  ])("rejects unrelated/error pages or missing login controls", (html) => {
    expect(interpretResponse(200, response().headers, html, revision).ok).toBe(
      false,
    );
  });

  it("rejects a healthy previous deployment and missing revision headers", () => {
    for (const sha of ["b".repeat(40), ""]) {
      expect(
        interpretResponse(
          200,
          response(200, loginHtml, sha).headers,
          loginHtml,
          revision,
        ),
      ).toMatchObject({
        contentFound: true,
        revisionMatches: false,
        ok: false,
      });
    }
  });

  it("rejects non-HTML responses even when markers are present", () => {
    expect(
      interpretResponse(
        200,
        new Headers({
          "content-type": "application/json",
          "x-cappy-hub-revision": revision,
        }),
        loginHtml,
        revision,
      ).ok,
    ).toBe(false);
  });
});

describe("deployment configuration", () => {
  it("uses only the canonical origin's login route", () => {
    expect(productionLoginUrl(origin)).toBe(`${origin}/login`);
    expect(productionLoginUrl(`${origin}/`)).toBe(`${origin}/login`);
  });

  it.each([
    undefined,
    "",
    "not a URL",
    "http://cappy.example",
    "https://user:password@cappy.example",
    `${origin}/preview`,
    `${origin}?token=private`,
    `${origin}#private`,
  ])("rejects unsafe/missing URL configuration without echoing it", (value) => {
    expect(() => productionLoginUrl(value)).toThrow("canonical HTTPS origin");
    try {
      productionLoginUrl(value);
    } catch (error) {
      expect(String(error)).not.toMatch(/password|token=private|#private/);
    }
  });

  it("exposes only valid public build revision metadata on /login", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", revision);
    expect(await nextConfig.headers!()).toEqual([
      {
        source: "/login",
        headers: [{ key: "x-cappy-hub-revision", value: revision }],
      },
    ]);
    for (const value of ["", "invalid", "secret\r\nInjected: value"]) {
      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", value);
      expect(await nextConfig.headers!()).toEqual([]);
    }
  });

  it("CLI exits unsuccessfully for missing configuration", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/verify-production-deployment.mjs"],
      {
        env: {
          ...process.env,
          PRODUCTION_APP_URL: "",
          EXPECTED_DEPLOYMENT_SHA: revision,
        },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PRODUCTION_APP_URL");
  });
});

describe("production deployment polling", () => {
  it("retries unavailable and old responses until the intended deployment serves login", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(
        new Error("network error containing private token"),
      )
      .mockResolvedValueOnce(response(503, "Deployment unavailable"))
      .mockResolvedValueOnce(response(200, loginHtml, "b".repeat(40)))
      .mockResolvedValueOnce(response());
    const log = vi.fn();
    const pending = verifyProductionDeployment(origin, revision, {
      fetchImpl,
      log,
    });
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(performance.now()).toBe(3 * RETRY_INTERVAL_MS);
    for (const [url, options] of fetchImpl.mock.calls) {
      expect(url).toBe(`${origin}/login`);
      expect(options).toMatchObject({
        method: "GET",
        redirect: "manual",
        headers: { Accept: "text/html", "Cache-Control": "no-cache" },
      });
      expect(options?.headers).not.toHaveProperty("Authorization");
      expect(options?.headers).not.toHaveProperty("Cookie");
    }
    const logs = log.mock.calls.flat().join("\n");
    expect(logs).toContain("attempt 2: HTTP=503, expected content=false");
    expect(logs).toContain(
      "attempt 3: HTTP=200, expected content=true, HTML=true, expected revision=false",
    );
    expect(logs).toContain("smoke verification passed");
    expect(logs).not.toContain("private token");
  });

  it("fails at the maximum timeout with diagnostics instead of passing", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => response(200, "<h1>Unrelated page</h1>"));
    const log = vi.fn();
    const pending = expect(
      verifyProductionDeployment(origin, revision, { fetchImpl, log }),
    ).rejects.toThrow(
      /timed out after 600s.*https:\/\/cappy.example\/login.*HTTP=200, expected content=false/,
    );
    await vi.runAllTimersAsync();
    await pending;
    expect(performance.now()).toBe(TIMEOUT_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(TIMEOUT_MS / RETRY_INTERVAL_MS);
    expect(log.mock.calls.flat().join("\n")).not.toContain("passed");
  });

  it("bounds stalled requests and body reads within the overall timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, options) => {
        const signal = options!.signal!;
        return {
          status: 200,
          headers: response().headers,
          text: () =>
            new Promise<string>((_resolve, reject) =>
              signal.addEventListener(
                "abort",
                () => reject(new Error("private response details")),
                { once: true },
              ),
            ),
        } as Response;
      });
    const log = vi.fn();
    const pending = expect(
      verifyProductionDeployment(origin, revision, { fetchImpl, log }),
    ).rejects.toThrow("timed out after 600s");
    await vi.runAllTimersAsync();
    await pending;
    expect(performance.now()).toBe(TIMEOUT_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(
      TIMEOUT_MS / (REQUEST_TIMEOUT_MS + RETRY_INTERVAL_MS),
    );
    expect(log.mock.calls.flat().join("\n")).toContain(
      "HTTP=200, expected content=false, expected revision=false, request timed out",
    );
    expect(log.mock.calls.flat().join("\n")).not.toContain(
      "private response details",
    );
  });

  it("fails invalid expected revision before making a request", async () => {
    const fetchImpl = vi.fn();
    await expect(
      verifyProductionDeployment(origin, "", { fetchImpl }),
    ).rejects.toThrow("EXPECTED_DEPLOYMENT_SHA");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
