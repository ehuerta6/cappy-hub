import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  requireCurrentOfficer: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/current-officer", () => ({
  requireCurrentOfficer: mocks.requireCurrentOfficer,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useSearchParams: () => new URLSearchParams(),
}));

import { canManageEvent, getAuthorizationContext } from "@/lib/authorization";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentOfficer.mockResolvedValue({ id: 8 });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.redirect.mockImplementation(() => {
    throw new Error("redirected");
  });
});

const actor = (
  positionCode: string,
  branchIds: number[],
  applicationRole = "officer",
  positionName = "",
) => ({ positionCode, positionName, branchIds, applicationRole }) as never;

describe("canManageEvent branch authorization", () => {
  it("allows a Lead to manage matching single and multi-branch Events", () => {
    const lead = actor("lead", [1]);

    expect(canManageEvent(lead, [1])).toBe(true);
    expect(canManageEvent(lead, [1, 4])).toBe(true);
  });

  it("allows a Lead with multiple branches when any Event branch overlaps", () => {
    expect(canManageEvent(actor("lead", [1, 3]), [3, 4])).toBe(true);
  });

  it("denies Leads without overlap and Leads managing global Events", () => {
    const lead = actor("lead", [1]);

    expect(canManageEvent(lead, [3, 4])).toBe(false);
    expect(canManageEvent(lead, [])).toBe(false);
  });

  it("preserves admin and Event executive access", () => {
    expect(canManageEvent(actor("Officer", [], "admin"), [])).toBe(true);
    for (const position of [
      "president",
      "vice_president_operations",
      "vice_president_academics",
    ]) {
      expect(canManageEvent(actor(position, []), [])).toBe(true);
    }
  });

  it("does not grant privileges based on a deceptive display name", () => {
    expect(
      canManageEvent(actor("custom_lead", [1], "officer", "Lead"), [1]),
    ).toBe(false);
    expect(
      canManageEvent(actor("custom_president", [], "officer", "President"), []),
    ).toBe(false);
    expect(
      canManageEvent(actor("lead", [1], "officer", "Branch Lead"), [1]),
    ).toBe(true);
    expect(
      canManageEvent(actor("president", [], "officer", "Club President"), []),
    ).toBe(true);
  });

  it("does not grant Event management to ordinary Officers", () => {
    expect(canManageEvent(actor("officer", [1]), [1])).toBe(false);
  });
});

describe("writable period context", () => {
  it("requires explicit context and rejects a missing value", async () => {
    await expect(
      getAuthorizationContext({
        enforceWritablePeriod: true,
        periodContext: null,
      }),
    ).rejects.toThrow("redirected");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("checks the supplied period context through the database", async () => {
    await expect(
      getAuthorizationContext({
        enforceWritablePeriod: true,
        periodContext: "42",
      }),
    ).resolves.toEqual({ id: 8 });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "assert_academic_period_context_writable",
      { p_period_context: "42" },
    );
  });

  it("redirects when the database says the selected period is read only", async () => {
    mocks.rpc.mockResolvedValue({
      error: { message: "Historical period is read-only" },
    });
    await expect(
      getAuthorizationContext({
        enforceWritablePeriod: true,
        periodContext: "123",
      }),
    ).rejects.toThrow("redirected");
  });
});
