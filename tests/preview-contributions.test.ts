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
    pulls?: (typeof pull)[];
    deployments?: object[] | (() => object[]);
    deploymentsBySha?: Record<string, object[]>;
    deploymentStatus?: object | (() => object);
    commitStatuses?: object[];
    currentPull?: object | (() => object);
    response?: () => Response;
    rejectStatusFor?: string;
  } = {},
) {
  const writes: {
    sha: string;
    state: string;
    context: string;
    description: string;
    target_url: string;
  }[] = [];
  const statusAttempts: typeof writes = [];
  const histories = new Map<string, object[]>([
    [sha, options.commitStatuses ?? []],
  ]);
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
    const pullNumber = /^\/pulls\/(\d+)$/.exec(path)?.[1];
    if (pullNumber)
      return Response.json(
        pullNumber !== String(pull.number)
          ? options.pulls?.find((entry) => entry.number === Number(pullNumber))
          : typeof options.currentPull === "function"
            ? options.currentPull()
            : (options.currentPull ?? pull),
      );
    if (path === "/deployments")
      return Response.json(
        options.deploymentsBySha?.[url.searchParams.get("sha") ?? ""] ??
          (typeof options.deployments === "function"
            ? options.deployments()
            : (options.deployments ?? [deployment])),
      );
    if (/^\/deployments\/\d+\/statuses$/.test(path))
      return Response.json([
        typeof options.deploymentStatus === "function"
          ? options.deploymentStatus()
          : (options.deploymentStatus ?? ready),
      ]);
    const statusSha = /^\/commits\/([a-f0-9]+)\/statuses$/.exec(path)?.[1];
    if (statusSha) {
      const offset = (Number(url.searchParams.get("page") ?? 1) - 1) * 100;
      return Response.json(
        (histories.get(statusSha) ?? []).slice(offset, offset + 100),
      );
    }
    const writeSha = /^\/statuses\/([a-f0-9]+)$/.exec(path)?.[1];
    if (writeSha && init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      statusAttempts.push({ sha: writeSha, ...payload });
      if (writeSha === options.rejectStatusFor)
        return Response.json({}, { status: 422 });
      writes.push({ sha: writeSha, ...payload });
      const published = {
        ...payload,
        creator: { login: "github-actions[bot]" },
      };
      histories.set(writeSha, [published, ...(histories.get(writeSha) ?? [])]);
      return Response.json(published, { status: 201 });
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
  return { run, writes, statusAttempts, requests };
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

  it("keeps more than 1000 unchanged unavailable reconciliations to one status write", async () => {
    const api = harness({ deployments: [] });
    for (let run = 1; run <= 1001; run += 1) {
      const result = await api.run({
        runUrl: `https://github.com/ehuerta6/cappy-hub/actions/runs/${run}`,
      });
      expect(result).toEqual([{ number: 460, state: "pending" }]);
    }
    expect(api.writes).toHaveLength(1);
  });

  it("does not append an unchanged failed deployment result on each event", async () => {
    const api = harness({ deploymentStatus: { ...ready, state: "failure" } });
    for (let run = 0; run < 4; run += 1) await api.run();
    expect(api.writes.map(({ state }) => state)).toEqual(["failure"]);
  });

  it("retries an unhealthy login without cycling its unchanged status, then records recovery", async () => {
    vi.useFakeTimers();
    let healthy = false;
    const api = harness({
      response: () =>
        healthy
          ? new Response(html, {
              headers: {
                "content-type": "text/html",
                "x-cappy-hub-revision": sha,
              },
            })
          : new Response("Broken", { status: 500 }),
    });
    for (let run = 0; run < 3; run += 1) {
      const pending = api.run();
      await vi.runAllTimersAsync();
      expect(await pending).toEqual([{ number: 460, state: "failure" }]);
    }
    expect(api.writes.map(({ state }) => state)).toEqual([
      "pending",
      "failure",
    ]);
    healthy = true;
    await api.run();
    expect(api.writes.map(({ state }) => state)).toEqual([
      "pending",
      "failure",
      "success",
    ]);
  });

  it("continues with a healthy second PR after the first PR's status publication is rejected", async () => {
    const secondSha = "b".repeat(40);
    const secondPull = {
      ...pull,
      number: 461,
      head: { ...pull.head, sha: secondSha },
    };
    const api = harness({
      pulls: [pull, secondPull],
      rejectStatusFor: sha,
      deploymentsBySha: {
        [sha]: [],
        [secondSha]: [{ ...deployment, id: 322, sha: secondSha }],
      },
      response: () =>
        new Response(html, {
          headers: {
            "content-type": "text/html",
            "x-cappy-hub-revision": secondSha,
          },
        }),
    });
    await expect(api.run()).resolves.toEqual([
      { number: 460, state: "failure" },
      { number: 461, state: "success" },
    ]);
    expect(
      api.statusAttempts.filter((attempt) => attempt.sha === sha),
    ).toHaveLength(1);
    expect(api.writes.at(-1)).toMatchObject({
      sha: secondSha,
      state: "success",
    });
  });

  it("finds its latest status beyond a page of unrelated contexts before deciding to write", async () => {
    const api = harness({
      deployments: [],
      commitStatuses: [
        ...Array.from({ length: 100 }, (_, index) => ({
          context: `other-${index}`,
          state: "success",
        })),
        {
          context: "Preview verified",
          state: "pending",
          description:
            "Awaiting Vercel Preview; authorize the fork deployment if requested.",
          creator: { login: "github-actions[bot]" },
        },
      ],
    });
    await api.run();
    expect(api.writes).toHaveLength(0);
    expect(
      api.requests.some(({ url }) =>
        url.includes("/statuses?per_page=100&page=2"),
      ),
    ).toBe(true);
  });

  it("continues when publishing a verification failure also fails", async () => {
    const secondSha = "b".repeat(40);
    const secondPull = {
      ...pull,
      number: 461,
      head: { ...pull.head, sha: secondSha },
    };
    let statusReads = 0;
    const api = harness({
      pulls: [pull, secondPull],
      rejectStatusFor: sha,
      deploymentsBySha: {
        [sha]: [deployment],
        [secondSha]: [{ ...deployment, id: 322, sha: secondSha }],
      },
      deploymentStatus: () =>
        ++statusReads === 1
          ? { ...ready, state: "failure" }
          : { ...ready, id: 655 },
      response: () =>
        new Response(html, {
          headers: {
            "content-type": "text/html",
            "x-cappy-hub-revision": secondSha,
          },
        }),
    });
    await expect(api.run()).resolves.toEqual([
      { number: 460, state: "failure" },
      { number: 461, state: "success" },
    ]);
    expect(
      api.statusAttempts.filter((attempt) => attempt.sha === sha),
    ).toHaveLength(1);
    expect(api.writes.at(-1)).toMatchObject({
      sha: secondSha,
      state: "success",
    });
  });
});
