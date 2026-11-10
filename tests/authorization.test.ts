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

import {
  canManageEvent,
  canManageTask,
  getAuthorizationContext,
} from "@/lib/authorization";

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
  it("allows a Lead to manage Events across Branches, including global Events", () => {
    const lead = actor("lead", [1]);

    expect(canManageEvent(lead)).toBe(true);
    expect(canManageEvent(actor("lead", [1, 3]))).toBe(true);
  });

  it("keeps Task manager access Branch-scoped for Leads", () => {
    const lead = actor("lead", [1]);

    expect(canManageTask(lead, 1)).toBe(true);
    expect(canManageTask(lead, 3)).toBe(false);
  });

  it("preserves admin and Event executive access", () => {
    expect(canManageEvent(actor("Officer", [], "admin"))).toBe(true);
    for (const position of [
      "president",
      "vice_president_operations",
      "vice_president_academics",
    ]) {
      expect(canManageEvent(actor(position, []))).toBe(true);
    }
  });

  it("does not grant privileges based on a deceptive display name", () => {
    expect(canManageEvent(actor("custom_lead", [1], "officer", "Lead"))).toBe(
      false,
    );
    expect(
      canManageEvent(actor("custom_president", [], "officer", "President")),
    ).toBe(false);
    expect(canManageEvent(actor("lead", [1], "officer", "Branch Lead"))).toBe(
      true,
    );
    expect(
      canManageEvent(actor("president", [], "officer", "Club President")),
    ).toBe(true);
  });

  it("does not grant Event management to ordinary Officers", () => {
    expect(canManageEvent(actor("officer", [1]))).toBe(false);
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
