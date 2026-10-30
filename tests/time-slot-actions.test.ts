import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
  canManageEvent: (
    actor: { positionCode?: string; branchIds?: number[] },
    branches: number[],
  ) =>
    actor.positionCode === "president" ||
    (actor.positionCode === "lead" &&
      branches.some((branchId) => actor.branchIds?.includes(branchId))),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { correctHistoricalSlotRoster } from "@/app/(protected)/events/time-slot-actions";

const initial = { error: "", success: "" };
const rpc = vi.fn();
let branches = [{ branch_id: 1 }];
const from = vi.fn(() => {
  const query = {
    select: () => query,
    eq: () => query,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: branches, error: null }).then(resolve),
  };
  return query;
});
const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields))
    for (const item of [value].flat()) data.append(key, item);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  branches = [{ branch_id: 1 }];
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionCode: "officer",
    branchIds: [1],
  } as never);
  vi.mocked(createClient).mockResolvedValue({ rpc, from } as never);
  rpc.mockResolvedValue({ data: null, error: null });
});

it("submits historical manager roster corrections through the trusted bulk RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 5,
    positionCode: "lead",
    branchIds: [1],
  } as never);
  rpc.mockResolvedValue({
    data: {
      added_officer_ids: [9, 10],
      award_transaction_ids: [101, 102, 103],
    },
    error: null,
  });
  const result = await correctHistoricalSlotRoster(
    initial,
    form({
      event_id: "12",
      officer_ids: ["9", "10"],
      slot_ids: ["4", "5"],
    }),
  );

  expect(result.success).toContain("reconciled 3 Point transactions");
  expect(rpc).toHaveBeenCalledWith("bulk_add_event_officers_to_slots", {
    p_event_id: 12,
    p_officer_ids: [9, 10],
    p_slot_ids: [4, 5],
  });
});

it("keeps unauthorized bulk assignment from reaching the RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 5,
    positionCode: "lead",
    branchIds: [2],
  } as never);
  const result = await correctHistoricalSlotRoster(
    initial,
    form({ event_id: "12", officer_ids: "9", slot_ids: "4" }),
  );
  expect(result.error).toBe("Event outside branch scope");
  expect(rpc).not.toHaveBeenCalled();
});
