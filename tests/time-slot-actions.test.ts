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
import { revalidatePath } from "next/cache";
import {
  assignBulkOfficersToTimeSlots,
  changeTimeSlotSignup,
} from "@/app/(protected)/events/time-slot-actions";

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

it("uses only the signed-in Officer for self slot selection", async () => {
  const result = await changeTimeSlotSignup(
    initial,
    form({ event_id: "12", mode: "join_selected", slot_ids: ["4", "5"] }),
  );

  expect(result.error).toBe("");
  expect(rpc).toHaveBeenCalledWith("change_event_time_slot_signup", {
    p_event_id: 12,
    p_officer_id: 8,
    p_slot_ids: [4, 5],
    p_mode: "join_selected",
  });
  expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
});

it("blocks cross-Officer slot changes outside the manager's Event scope", async () => {
  const result = await changeTimeSlotSignup(
    initial,
    form({
      event_id: "12",
      officer_id: "9",
      mode: "leave_all",
    }),
  );

  expect(result.error).toBe("Event outside branch scope");
  expect(rpc).not.toHaveBeenCalled();
});

it("submits manager slot assignments through the atomic bulk RPC", async () => {
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
  const result = await assignBulkOfficersToTimeSlots(
    initial,
    form({
      event_id: "12",
      officer_ids: ["9", "10"],
      slot_ids: ["4", "5"],
    }),
  );

  expect(result.success).toContain("created 3 separate slot awards");
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
  const result = await assignBulkOfficersToTimeSlots(
    initial,
    form({ event_id: "12", officer_ids: "9", slot_ids: "4" }),
  );
  expect(result.error).toBe("Event outside branch scope");
  expect(rpc).not.toHaveBeenCalled();
});
