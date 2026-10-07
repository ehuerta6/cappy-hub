import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { canManageEvent } from "@/lib/authorization";

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
