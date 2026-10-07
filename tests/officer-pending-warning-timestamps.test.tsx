import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(async () => ({ id: 4 })),
  canManageOfficers: vi.fn(() => false),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      let officerLookup = false;
      const query = {
        select: () => query,
        eq: () => query,
        in: () => {
          officerLookup = true;
          return query;
        },
        order: () => query,
        or: () => query,
        not: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          const data =
            table === "warning_approvals"
              ? [{ warning_id: 9, approver_role: "President" }]
              : table === "officer_warnings"
                ? [
                    {
                      id: 9,
                      officer_id: 12,
                      reason: "Missed a scheduled event",
                      created_at: "2026-10-06T23:53:11Z",
                    },
                  ]
                : table === "officers" && officerLookup
                  ? [{ id: 12, name: "Synthetic Officer" }]
                  : [];
          return Promise.resolve({ data, count: 0, error: null }).then(resolve);
        },
      };
      return query;
    },
  })),
}));
vi.mock("@/app/(protected)/officers/warning-forms", () => ({
  WarningDecisionForm: () => <div>Decision controls</div>,
}));

import OfficersPage from "@/app/(protected)/officers/page";

it("renders pending warning creation time in America/Denver", async () => {
  const html = renderToStaticMarkup(
    await OfficersPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain("Oct 6, 2026, 5:53 PM");
  expect(html).toContain("Missed a scheduled event");
  expect(html).toContain("Decision controls");
});
