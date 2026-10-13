import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/authorization", async (original) => ({
  ...(await original<typeof import("@/lib/authorization")>()),
  getAuthorizationContext: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/(protected)/officers/warning-forms", () => ({
  WarningDecisionForm: ({ warningId }: { warningId: number }) => (
    <span>Decide warning {warningId}</span>
  ),
}));
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
const warnings = Array.from({ length: 8 }, (_, index) => ({
  id: index + 1,
  officer_id: index + 1,
  reason: `Complete reason ${index + 1}`,
  created_at: `2026-10-${String(index + 1).padStart(2, "0")}T18:00:00Z`,
  status: "pending",
  voided_at: null as string | null,
  officers: { id: index + 1, name: `Alex ${index + 1}` },
  warning_approvals: [
    {
      approver_officer_id: index === 7 ? 99 : 50,
      decision: "pending",
      approver_role: "President",
    },
  ],
}));
let queries: Query[];
let role: "admin" | "lead" | "officer";
let warningRows: typeof warnings;

beforeEach(() => {
  queries = [];
  role = "officer";
  warningRows = [
    ...warnings,
    { ...warnings[0], id: 9, status: "approved" },
    { ...warnings[0], id: 10, voided_at: "2026-10-12T00:00:00Z" },
  ];
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
        } else if (table === "officer_warnings") {
          data = warningRows.filter(
            (warning) =>
              has("eq", "status", warning.status) &&
              has("is", "voided_at", warning.voided_at) &&
              warning.warning_approvals.some(
                (approval) =>
                  (has(
                    "eq",
                    "warning_approvals.approver_officer_id",
                    approval.approver_officer_id,
                  ) ||
                    has(
                      "eq",
                      "eligible.approver_officer_id",
                      approval.approver_officer_id,
                    )) &&
                  (has("eq", "warning_approvals.decision", approval.decision) ||
                    has("eq", "eligible.decision", approval.decision)),
              ),
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
  expect(html).toContain('aria-label="Officer directory pages"');
  expect(html).toContain("Page 2 of 2");
  expect(html).toContain(
    'href="/officers?q=alex&amp;status=all&amp;position=2&amp;branch=3"',
  );
  expect(html).toContain(
    "returnTo=%2Fofficers%3Fq%3Dalex%26status%3Dall%26position%3D2%26branch%3D3%26page%3D2",
  );
  expect(html).toContain(
    'href="/officers?q=alex&amp;status=all&amp;position=2&amp;branch=3&amp;page=2&amp;view=warnings"',
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
  expect(html).not.toContain('name="page"');
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
  expect(html).toContain("Page 1 of 1");
});

it.each(["admin", "lead", "officer"] as const)(
  "bounds eligible %s warning review and gates management links",
  async (actorRole) => {
    role = actorRole;
    const directory = await render();
    expect(directory).toContain("7 warnings awaiting your decision");
    expect(directory).toContain('href="/officers?view=warnings"');
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

    queries = [];
    const review = await render({ view: "warnings", reviewPage: "2" });
    expect(review).toContain("Page 2 of 2 · 7 pending");
    expect(review).toContain("Complete reason 6");
    expect(review).toContain("Complete reason 7");
    expect(review).not.toContain("Complete reason 5");
    expect(review).not.toContain("Complete reason 8");
    expect(review).toContain("Decide warning 6");
    expect(review).toContain("Created Oct 6, 2026");
    expect(review).toContain("Your decision: Pending");
    expect(review).toContain("President: Pending");
    expect(review).toContain(
      "returnTo=%2Fofficers%3Fview%3Dwarnings%26reviewPage%3D2",
    );
    const countQuery = queries.find(
      ({ table, calls }) =>
        table === "officer_warnings" &&
        calls.some(
          (call) =>
            call[0] === "select" && (call[2] as { head?: boolean })?.head,
        ),
    )!;
    expect(countQuery.calls).toContainEqual([
      "eq",
      "warning_approvals.approver_officer_id",
      50,
    ]);
    expect(countQuery.calls).toContainEqual(["is", "voided_at", null]);
    const pageQuery = queries.find(
      ({ table, calls }) =>
        table === "officer_warnings" &&
        calls.some((call) => call[0] === "range"),
    )!;
    expect(pageQuery.calls).toContainEqual(["range", 5, 9]);
    expect(pageQuery.calls).toContainEqual([
      "eq",
      "eligible.approver_officer_id",
      50,
    ]);
  },
);

it("hides the warning entry when no pending decision is eligible", async () => {
  warningRows = [];
  const html = await render();
  expect(html).not.toContain("Review decisions");
  expect(html).toContain("Showing 1–8 of 11 officers");
});
