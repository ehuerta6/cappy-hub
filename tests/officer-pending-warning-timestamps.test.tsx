import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(async () => ({ id: 4 })),
  canManageOfficers: vi.fn(() => false),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      let countOnly = false;
      const query = {
        select: (_selection: string, options?: { head?: boolean }) => {
          countOnly = options?.head ?? false;
          return query;
        },
        eq: () => query,
        is: () => query,
        order: () => query,
        or: () => query,
        not: () => query,
        range: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          const data =
            table === "officer_warnings" && !countOnly
              ? [
                  {
                    id: 9,
                    officer_id: 12,
                    reason: "Missed a scheduled event",
                    created_at: "2026-10-06T23:53:11Z",
                    officers: { id: 12, name: "Synthetic Officer" },
                    warning_approvals: [
                      {
                        approver_role: "President",
                        decision: "pending",
                        decided_at: null,
                      },
                    ],
                  },
                ]
              : [];
          return Promise.resolve({
            data,
            count: table === "officer_warnings" ? 1 : 0,
            error: null,
          }).then(resolve);
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
    await OfficersPage({ searchParams: Promise.resolve({ view: "warnings" }) }),
  );

  expect(html).toContain("Oct 6, 2026, 5:53 PM");
  expect(html).toContain("Missed a scheduled event");
  expect(html).not.toContain("Decision controls");
  expect(html).toContain("Historical approval: Pending");
});
