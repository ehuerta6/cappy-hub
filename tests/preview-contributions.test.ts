import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyContributionPreviews } from "../scripts/verify-preview-contributions.mjs";

const sha = "a".repeat(40);
const repository = "ehuerta6/cappy-hub";
const origin = "https://cappy-abc123def-emiliano-huerta.vercel.app";
const redeployedOrigin = "https://cappy-def456abc-emiliano-huerta.vercel.app";
const runUrl = "https://github.com/ehuerta6/cappy-hub/actions/runs/123";
const pull = {
  number: 460,
  state: "open",
  head: { sha, repo: { full_name: "contributor/cappy-hub" } },
  base: { ref: "main", repo: { full_name: repository } },
};
const deployment = {
  id: 321,
  sha,
  environment: "Preview",
  production_environment: false,
  creator: { login: "vercel[bot]" },
  created_at: "2026-11-17T02:00:00Z",
};
const ready = {
  id: 654,
  state: "success",
  environment_url: origin,
  creator: { login: "vercel[bot]" },
};
const html =
  "<h1>Cappy Hub</h1><p>Coding Interview Club administration</p><button>Continue with Google</button>";

function harness(
  options: {
    pulls?: object[];
    deployments?: object[] | (() => object[]);
    deploymentStatus?: object | (() => object);
    commitStatuses?: object[];
    currentPull?: object | (() => object);
    response?: () => Response;
  } = {},
) {
  const writes: {
    sha: string;
    state: string;
    context: string;
    description: string;
    target_url: string;
  }[] = [];
  const requests: { url: string; options?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (request, init) => {
    const input = request instanceof Request ? request.url : String(request);
    requests.push({ url: input, options: init });
    if (input === `${origin}/login` || input === `${redeployedOrigin}/login`) {
      return (
        options.response?.() ??
        new Response(html, {
          headers: { "content-type": "text/html", "x-cappy-hub-revision": sha },
        })
      );
    }
    const url = new URL(input);
    if (url.origin !== "https://api.github.com")
      throw new Error("Unexpected credential destination");
    const path = url.pathname.replace(`/repos/${repository}`, "");
    if (path === "/pulls") {
      return Response.json(options.pulls ?? [pull]);
    }
    if (path === "/pulls/460")
      return Response.json(
        typeof options.currentPull === "function"
          ? options.currentPull()
          : (options.currentPull ?? pull),
      );
    if (path === "/deployments")
      return Response.json(
        typeof options.deployments === "function"
          ? options.deployments()
          : (options.deployments ?? [deployment]),
      );
    if (/^\/deployments\/\d+\/statuses$/.test(path))
      return Response.json([
        typeof options.deploymentStatus === "function"
          ? options.deploymentStatus()
          : (options.deploymentStatus ?? ready),
      ]);
    if (path === `/commits/${sha}/statuses`)
      return Response.json(options.commitStatuses ?? []);
    if (path === `/statuses/${sha}` && init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      writes.push({ sha, ...payload });
      return Response.json(payload, { status: 201 });
    }
    throw new Error(`Unexpected GitHub request: ${path}`);
  };
  const run = (overrides = {}) =>
    verifyContributionPreviews({
      repository,
      token: "github-token",
      bypassSecret: "preview-bypass",
      runUrl,
      fetchImpl,
      log: vi.fn(),
      ...overrides,
    });
  return { run, writes, requests };
}

afterEach(() => vi.useRealTimers());

describe("contributor Preview verification", () => {
  it.each(["contributor/cappy-hub", repository])(
    "verifies the current Preview for %s and publishes success on its exact head",
    async (full_name) => {
      const api = harness({
        pulls: [{ ...pull, head: { ...pull.head, repo: { full_name } } }],
      });
      await api.run();
      expect(api.writes.map(({ state }) => state)).toEqual([
        "pending",
        "success",
      ]);
      expect(api.writes.at(-1)).toMatchObject({
        sha,
        context: "Preview verified",
        target_url: runUrl,
      });
      const request = api.requests.find(({ url }) => url === `${origin}/login`);
      expect(request?.options).toMatchObject({
        method: "GET",
        redirect: "manual",
        headers: { "x-vercel-protection-bypass": "preview-bypass" },
      });
      expect(request?.options?.headers).not.toHaveProperty("Authorization");
    },
  );

  it("keeps the required status pending when a fork has no authorized deployment", async () => {
    const api = harness({ deployments: [] });
    await api.run();
    expect(api.writes).toHaveLength(1);
    expect(api.writes[0]).toMatchObject({
      state: "pending",
      context: "Preview verified",
    });
    expect(api.writes[0].description).toContain("authoriz");
    expect(
      api.requests.every(({ url }) =>
        url.startsWith("https://api.github.com/"),
      ),
    ).toBe(true);
  });

  it.each(["pending", "queued", "in_progress"])(
    "keeps verification pending while Vercel reports %s",
    async (state) => {
      const api = harness({ deploymentStatus: { ...ready, state } });
      await api.run();
      expect(api.writes.map(({ state }) => state)).toEqual(["pending"]);
    },
  );

  it.each(["failure", "error", "inactive"])(
    "does not satisfy the gate for a %s deployment",
    async (state) => {
      const api = harness({ deploymentStatus: { ...ready, state } });
      await api.run();
      expect(api.writes.at(-1)?.state).toBe("failure");
      expect(api.requests.some(({ url }) => url === `${origin}/login`)).toBe(
        false,
      );
    },
  );

  it("selects the newest deployment by its ISO timestamp rather than API order", async () => {
    const api = harness({
      deployments: [
        { ...deployment, id: 999, created_at: "2026-11-16T01:00:00Z" },
        deployment,
      ],
    });
    await api.run();
    expect(
      api.requests.some(({ url }) => url.includes("/deployments/321/statuses")),
    ).toBe(true);
    expect(
      api.requests.some(({ url }) => url.includes("/deployments/999/statuses")),
    ).toBe(false);
  });

  it.each([
    { ...deployment, sha: "b".repeat(40) },
    { ...deployment, environment: "Production" },
    { ...deployment, production_environment: true },
    { ...deployment, creator: { login: "contributor" } },
  ])("ignores an unrelated or untrusted deployment", async (candidate) => {
    const api = harness({ deployments: [candidate] });
    await api.run();
    expect(api.writes.map(({ state }) => state)).toEqual(["pending"]);
    expect(api.requests.some(({ url }) => url === `${origin}/login`)).toBe(
      false,
    );
  });

  it.each([
    "https://attacker.vercel.app",
    "https://cappy-abc123def-other-team.vercel.app",
    "https://other-app-abc123def-emiliano-huerta.vercel.app",
    "https://cappy-git-feature-emiliano-huerta.vercel.app",
    `${origin}/admin`,
    `${origin}?token=abc`,
  ])(
    "rejects unsafe Preview URL %s before disclosing the bypass header",
    async (environment_url) => {
      const api = harness({ deploymentStatus: { ...ready, environment_url } });
      await api.run();
      expect(api.writes.at(-1)?.state).toBe("failure");
      expect(
        api.requests.every(({ url }) =>
          url.startsWith("https://api.github.com/"),
        ),
      ).toBe(true);
    },
  );

  it("rejects a deployment status published by someone other than Vercel", async () => {
    const api = harness({
      deploymentStatus: { ...ready, creator: { login: "contributor" } },
    });
    await api.run();
    expect(api.writes.at(-1)?.state).toBe("failure");
    expect(api.requests.some(({ url }) => url === `${origin}/login`)).toBe(
      false,
    );
  });

  it.each([
    { ...pull, state: "closed" },
    { ...pull, head: { ...pull.head, sha: "b".repeat(40) } },
  ])(
    "does not approve a closed or superseded pull request",
    async (currentPull) => {
      const api = harness({ currentPull });
      await api.run();
      expect(api.writes.some(({ state }) => state === "success")).toBe(false);
    },
  );

  it("does not repeat successful verification of the same deployment on unrelated events", async () => {
    const api = harness({
      commitStatuses: [
        {
          context: "Preview verified",
          state: "success",
          description:
            "Login verified: 321/654 cappy-abc123def-emiliano-huerta.vercel.app.",
          creator: { login: "github-actions[bot]" },
        },
      ],
    });
    await api.run();
    expect(api.writes).toEqual([]);
    expect(api.requests.some(({ url }) => url === `${origin}/login`)).toBe(
      false,
    );
  });

  it("does not publish success if the PR head changes during the HTTP request", async () => {
    let current = pull;
    const api = harness({
      currentPull: () => current,
      response: () => {
        current = { ...pull, head: { ...pull.head, sha: "b".repeat(40) } };
        return new Response(html, {
          headers: { "content-type": "text/html", "x-cappy-hub-revision": sha },
        });
      },
    });
    await api.run();
    expect(api.writes.map(({ state }) => state)).toEqual(["pending"]);
  });

  it("lets a maintainer force a fresh HTTP check of an already verified deployment", async () => {
    const api = harness({
      commitStatuses: [
        {
          context: "Preview verified",
          state: "success",
          description:
            "Login verified: 321/654 cappy-abc123def-emiliano-huerta.vercel.app.",
          creator: { login: "github-actions[bot]" },
        },
      ],
    });
    await api.run({ force: true });
    expect(api.writes.map(({ state }) => state)).toEqual([
      "pending",
      "success",
    ]);
    expect(api.requests.some(({ url }) => url === `${origin}/login`)).toBe(
      true,
    );
  });

  it("retries a failed deployment after a newer deployment becomes ready", async () => {
    const api = harness({
      commitStatuses: [
        {
          context: "Preview verified",
          state: "failure",
          description: "Preview deployment 123 failed.",
        },
      ],
    });
    await api.run();
    expect(api.writes.at(-1)?.state).toBe("success");
  });

  it("checks a new immutable URL when Vercel reuses the GitHub deployment id", async () => {
    const api = harness({
      deploymentStatus: {
        ...ready,
        id: 655,
        environment_url: redeployedOrigin,
      },
      commitStatuses: [
        {
          context: "Preview verified",
          state: "success",
          description:
            "Login verified: 321/654 cappy-abc123def-emiliano-huerta.vercel.app.",
          creator: { login: "github-actions[bot]" },
        },
      ],
    });
    await api.run();
    expect(
      api.requests.some(({ url }) => url === `${redeployedOrigin}/login`),
    ).toBe(true);
  });

  it("does not approve a deployment replaced during HTTP verification", async () => {
    let deployments = [deployment];
    const api = harness({
      deployments: () => deployments,
      response: () => {
        deployments = [
          { ...deployment, id: 322, created_at: "2026-11-17T03:00:00Z" },
        ];
        return new Response(html, {
          headers: { "content-type": "text/html", "x-cappy-hub-revision": sha },
        });
      },
    });
    await api.run();
    expect(api.writes.some(({ state }) => state === "success")).toBe(false);
    expect(api.writes.at(-1)?.state).toBe("pending");
  });

  it("does not reuse a cached success from a publisher other than GitHub Actions", async () => {
    const api = harness({
      commitStatuses: [
        {
          context: "Preview verified",
          state: "success",
          description:
            "Login verified: 321/654 cappy-abc123def-emiliano-huerta.vercel.app.",
          creator: { login: "contributor" },
        },
      ],
    });
    await api.run();
    expect(api.requests.some(({ url }) => url === `${origin}/login`)).toBe(
      true,
    );
    expect(api.writes.at(-1)?.state).toBe("success");
  });

  it("checks a newer status even when its immutable URL did not change", async () => {
    const api = harness({
      deploymentStatus: { ...ready, id: 655 },
      commitStatuses: [
        {
          context: "Preview verified",
          state: "success",
          description:
            "Login verified: 321/654 cappy-abc123def-emiliano-huerta.vercel.app.",
          creator: { login: "github-actions[bot]" },
        },
      ],
    });
    await api.run();
    expect(api.requests.some(({ url }) => url === `${origin}/login`)).toBe(
      true,
    );
    expect(api.writes.at(-1)?.state).toBe("success");
  });

  it("does not approve a newer status URL on the same deployment during HTTP verification", async () => {
    let status = ready;
    const api = harness({
      deploymentStatus: () => status,
      response: () => {
        status = { ...ready, id: 655, environment_url: redeployedOrigin };
        return new Response(html, {
          headers: { "content-type": "text/html", "x-cappy-hub-revision": sha },
        });
      },
    });
    await api.run();
    expect(api.writes.some(({ state }) => state === "success")).toBe(false);
    expect(api.writes.at(-1)?.state).toBe("pending");
  });

  it("fails the required status when the login HTTP response fails verification", async () => {
    vi.useFakeTimers();
    const api = harness({
      response: () => new Response("<h1>Broken page</h1>", { status: 500 }),
    });
    const run = api.run();
    await vi.runAllTimersAsync();
    await run;
    expect(api.writes.map(({ state }) => state)).toEqual([
      "pending",
      "failure",
    ]);
    expect(api.writes.at(-1)?.description).not.toContain("preview-bypass");
  });

  it("reports a missing bypass credential as failure without contacting the Preview", async () => {
    const api = harness();
    await api.run({ bypassSecret: "" });
    expect(api.writes.at(-1)?.state).toBe("failure");
    expect(api.requests.some(({ url }) => url === `${origin}/login`)).toBe(
      false,
    );
  });
});
