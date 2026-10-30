import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/authorization", async (original) => ({
  ...(await original<typeof import("@/lib/authorization")>()),
  getAuthorizationContext: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import OfficersPage from "@/app/(protected)/officers/page";

type Call = [string, ...unknown[]];
type Query = { table: string; calls: Call[] };
const officers = Array.from({ length: 11 }, (_, index) => ({
  id: index + 1,
  name: `Alex ${String(index + 1).padStart(2, "0")}`,
  utep_email: `alex${index + 1}@miners.utep.edu`,
  personal_email: `very-long-personal-address-${index + 1}@example.test`,
  position_id: 2,
  status: "active",
  classification: "senior",
  positions: { name: "Technical Officer" },
  officer_branches: [{ branch_id: 3, branches: { name: "operations" } }],
}));
let queries: Query[];
let role: "admin" | "lead" | "officer";

beforeEach(() => {
  queries = [];
  role = "officer";
  vi.mocked(getAuthorizationContext).mockImplementation(
    async () =>
      ({
        id: 50,
        applicationRole: role === "admin" ? "admin" : "officer",
        positionCode: role === "lead" ? "lead" : "officer",
        branchIds: role === "lead" ? [4] : [],
      }) as never,
  );
  vi.mocked(createClient).mockResolvedValue({
    from: (table: string) => {
      const record: Query = { table, calls: [] };
      queries.push(record);
      const query: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "is",
        "not",
        "or",
        "order",
        "range",
      ])
        query[method] = (...args: unknown[]) => {
          record.calls.push([method, ...args]);
          return query;
        };
      query.then = (resolve: (value: unknown) => unknown) => {
        const has = (method: string, field: string, value: unknown) =>
          record.calls.some(
            (call) =>
              call[0] === method && call[1] === field && call[2] === value,
          );
        let data: unknown[] = [];
        if (table === "officers") {
          data = officers.filter(
            (officer) =>
              (!record.calls.some(
                (call) => call[0] === "eq" && call[1] === "status",
              ) ||
                has("eq", "status", officer.status)) &&
              (!record.calls.some(
                (call) => call[0] === "eq" && call[1] === "position_id",
              ) ||
                has("eq", "position_id", officer.position_id)) &&
              (!record.calls.some(
                (call) =>
                  call[0] === "eq" && call[1] === "filter_branch.branch_id",
              ) ||
                officer.officer_branches.some((branch) =>
                  has("eq", "filter_branch.branch_id", branch.branch_id),
                )) &&
              (!record.calls.some((call) => call[0] === "or") ||
                officer.name.toLowerCase().includes("alex")),
          );
        } else if (table === "positions")
          data = [{ id: 2, name: "Technical Officer" }];
        else if (table === "branches") data = [{ id: 3, name: "operations" }];
        const count = data.length;
        const range = record.calls.find((call) => call[0] === "range");
        if (range) data = data.slice(Number(range[1]), Number(range[2]) + 1);
        const selection = record.calls.find((call) => call[0] === "select");
        if ((selection?.[2] as { head?: boolean } | undefined)?.head) data = [];
        return Promise.resolve({ data, count, error: null }).then(resolve);
      };
      return query;
    },
  } as never);
});

const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup(
    await OfficersPage({ searchParams: Promise.resolve(params) }),
  );

it("paginates eight fully filtered officers with exact count and return context", async () => {
  const html = await render({
    q: "alex",
    status: "all",
    position: "2",
    branch: "3",
    page: "2",
  });
  expect(html).toContain("Showing 9–11 of 11 officers");
  expect(html).toContain("Alex 09");
  expect(html).toContain("Alex 11");
  expect(html).not.toContain("Alex 08");
  expect(html).toContain("very-long-personal-address-11@example.test");
  expect(html).toContain('aria-label="Officer pages"');
  expect(html).toContain('option value="2" selected=""');
  expect(html).toContain("of 2");
  expect(html).toContain(
    'href="/officers?q=alex&amp;status=all&amp;position=2&amp;branch=3"',
  );
  expect(html).toContain(
    "returnTo=%2Fofficers%3Fq%3Dalex%26status%3Dall%26position%3D2%26branch%3D3%26page%3D2",
  );
  const query = queries.find(
    ({ table, calls }) =>
      table === "officers" && calls.some((call) => call[0] === "range"),
  )!;
  expect(query.calls).toContainEqual(["range", 8, 15]);
  expect(query.calls).toContainEqual(["order", "name"]);
  expect(query.calls).toContainEqual(["order", "id"]);
  expect(query.calls).toContainEqual(["eq", "filter_branch.branch_id", 3]);
  expect(query.calls.find((call) => call[0] === "or")?.[1]).toContain(
    "personal_email.imatch",
  );
  expect(html).toContain('action="/officers" method="get"');
  expect(html).not.toContain('type="hidden" name="page"');
});

it("redirects an out-of-range directory page to the last filtered page", async () => {
  await expect(render({ q: "alex", page: "99" })).rejects.toThrow(
    "redirect:/officers?q=alex&page=2",
  );
});

it("shows a clear zero-result state for a filtered directory", async () => {
  const html = await render({ status: "inactive" });
  expect(html).toContain("0 officers");
  expect(html).toContain("No officers match these filters.");
  expect(html).toContain('href="/officers"');
  expect(html).toContain("0 officers");
});

it.each(["admin", "lead", "officer"] as const)(
  "removes legacy approval navigation for %s while keeping directory access controls",
  async (actorRole) => {
    role = actorRole;
    const directory = await render();
    expect(directory).not.toContain("historical approval assignment");
    expect(directory).not.toContain("View historical approvals");
    expect(directory.includes('href="/officers/new"')).toBe(
      actorRole === "admin",
    );
    expect(directory.includes('href="/officers/catalogs"')).toBe(
      actorRole === "admin",
    );
    expect(directory).toContain("Operations");
    expect(
      queries
        .filter(({ table }) => table === "officers")
        .flatMap(({ calls }) => calls)
        .some(
          (call) => call[0] === "eq" && call[1] === "filter_branch.branch_id",
        ),
    ).toBe(false);

    expect(queries.some(({ table }) => table === "officer_warnings")).toBe(
      false,
    );
  },
);

it("routes the retired approval view URL back to the Officer directory", async () => {
  const html = await render({ view: "warnings", reviewPage: "2" });
  expect(html).toContain('aria-label="Officer filters"');
  expect(html).toContain("Showing 1–8 of 11 officers");
  expect(html).not.toContain("Historical warning approvals");
});
