import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
  canManageEvent: (
    actor: { positionCode?: string; branchIds?: number[] },
    branches: number[],
  ) =>
    actor.positionCode === "president" ||
    (actor.positionCode === "lead" &&
      branches.length > 0 &&
      branches.some((branchId) => actor.branchIds?.includes(branchId))),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  addPresenterSlot,
  changePresenterSlot,
  removePresenterSlot,
  reorderPresenterSlots,
  updatePresenterSlotDetails,
} from "@/app/(protected)/events/presenter-slot-actions";

const initial = { error: "", success: "" };
const rpc = vi.fn();
let slotEvent: { event_id: number; officer_id: number | null } | null;
let eventBranches: { branch_id: number }[];
const from = vi.fn((table: string) => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: slotEvent, error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: table === "event_branches" ? eventBranches : [],
        error: null,
      }).then(resolve),
  };
  return query;
});
const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields))
    for (const item of [value].flat()) data.append(key, item);
  return data;
};
const asOfficer = () =>
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionCode: "officer",
    branchIds: [1],
  } as never);
const asIntroLead = () =>
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 5,
    positionCode: "lead",
    branchIds: [1],
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  slotEvent = { event_id: 12, officer_id: null };
  eventBranches = [{ branch_id: 1 }];
  asOfficer();
  vi.mocked(createClient).mockResolvedValue({ rpc, from } as never);
  rpc.mockResolvedValue({ data: null, error: null });
});

it("volunteers the signed-in Officer without trusting a submitted officer", async () => {
  const result = await changePresenterSlot(
    initial,
    form({ slot_id: "3", release: "false" }),
  );
  expect(result).toEqual({
    error: "",
    success: "You are presenting in this slot",
  });
  expect(rpc).toHaveBeenCalledWith("change_presenter_slot", {
    p_slot_id: 3,
    p_officer_id: 8,
    p_release: false,
  });
  expect(from).not.toHaveBeenCalled();
  expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
});

it("lets an Officer step down from their own slot", async () => {
  const result = await changePresenterSlot(
    initial,
    form({ slot_id: "3", officer_id: "8", release: "true" }),
  );
  expect(result.success).toBe("You stepped down from this slot");
  expect(rpc).toHaveBeenCalledWith("change_presenter_slot", {
    p_slot_id: 3,
    p_officer_id: 8,
    p_release: true,
  });
});

it("blocks an Officer from assigning someone else before calling the RPC", async () => {
  const result = await changePresenterSlot(
    initial,
    form({ slot_id: "3", officer_id: "9", release: "false" }),
  );
  expect(result.error).toBe(
    "Cannot manage another officer presenter slot for this event",
  );
  expect(rpc).not.toHaveBeenCalled();
});

it("lets a Lead in the Event branch assign and remove another Officer", async () => {
  asIntroLead();
  expect(
    await changePresenterSlot(
      initial,
      form({ slot_id: "3", officer_id: "9", release: "false" }),
    ),
  ).toEqual({ error: "", success: "Presenter assigned" });
  expect(
    await changePresenterSlot(
      initial,
      form({ slot_id: "3", officer_id: "9", release: "true" }),
    ),
  ).toEqual({ error: "", success: "Presenter removed" });
  expect(rpc).toHaveBeenCalledTimes(2);
});

it("blocks a Lead outside the Event branch from managing slots", async () => {
  asIntroLead();
  eventBranches = [{ branch_id: 2 }];
  expect(
    (await addPresenterSlot(initial, form({ event_id: "12" }))).error,
  ).toBe("Event outside branch scope");
  expect(
    (await removePresenterSlot(initial, form({ slot_id: "3" }))).error,
  ).toBe("Event outside branch scope");
  expect(
    (
      await reorderPresenterSlots(
        initial,
        form({ event_id: "12", slot_ids: ["4", "3"] }),
      )
    ).error,
  ).toBe("Event outside branch scope");
  expect(
    (
      await updatePresenterSlotDetails(
        initial,
        form({ slot_id: "3", presentation_title: "Two Sum" }),
      )
    ).error,
  ).toBe("Cannot manage another officer presenter slot for this event");
  expect(rpc).not.toHaveBeenCalled();
});

it("reports a missing slot instead of calling the RPC", async () => {
  asIntroLead();
  slotEvent = null;
  expect(
    (await removePresenterSlot(initial, form({ slot_id: "3" }))).error,
  ).toBe("Presenter slot not found");
  expect(rpc).not.toHaveBeenCalled();
});

it.each([
  ["Presenter slot is already taken", "Presenter slot is already taken"],
  [
    "Event is full, so this officer cannot take a presenter slot",
    "Event is full, so this officer cannot take a presenter slot",
  ],
  [
    "Presenter slots are closed for this event",
    "Presenter slots are closed for this event",
  ],
  [
    'duplicate key value violates "presentation_slots_pkey"',
    "Could not save changes",
  ],
])(
  "maps the database error %j to a readable message",
  async (message, shown) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    const result = await changePresenterSlot(
      initial,
      form({ slot_id: "3", release: "false" }),
    );
    expect(result.error).toBe(shown);
    expect(result.success).toBe("");
    expect(revalidatePath).not.toHaveBeenCalled();
  },
);

it("adds, reorders and removes slots through the trusted RPCs", async () => {
  asIntroLead();
  expect(await addPresenterSlot(initial, form({ event_id: "12" }))).toEqual({
    error: "",
    success: "Presenter slot added",
  });
  expect(rpc).toHaveBeenLastCalledWith("add_presenter_slot", {
    p_event_id: 12,
  });
  await reorderPresenterSlots(
    initial,
    form({ event_id: "12", slot_ids: ["4", "3", "5"] }),
  );
  expect(rpc).toHaveBeenLastCalledWith("reorder_presenter_slots", {
    p_event_id: 12,
    p_slot_ids: [4, 3, 5],
  });
  await removePresenterSlot(initial, form({ slot_id: "5" }));
  expect(rpc).toHaveBeenLastCalledWith("remove_presenter_slot", {
    p_slot_id: 5,
  });
});

it("saves free-text details, including blank topic and difficulty", async () => {
  asIntroLead();
  const result = await updatePresenterSlotDetails(
    initial,
    form({
      slot_id: "3",
      presentation_title: "  ",
      difficulty: " Nightmare ",
      resource_url: " https://example.org/talk ",
      prep_notes: "",
    }),
  );
  expect(result).toEqual({
    error: "",
    success: "Presenter slot details saved",
  });
  expect(rpc).toHaveBeenCalledWith("update_presenter_slot_details", {
    p_slot_id: 3,
    p_title: "",
    p_url: "https://example.org/talk",
    p_difficulty: "Nightmare",
    p_notes: "",
  });
});

it("lets an Officer edit the details for their currently assigned slot", async () => {
  slotEvent = { event_id: 12, officer_id: 8 };
  const result = await updatePresenterSlotDetails(
    initial,
    form({
      slot_id: "3",
      officer_id: "9",
      presentation_title: "My interview talk",
    }),
  );

  expect(result).toEqual({
    error: "",
    success: "Presenter slot details saved",
  });
  expect(rpc).toHaveBeenCalledWith("update_presenter_slot_details", {
    p_slot_id: 3,
    p_title: "My interview talk",
    p_url: "",
    p_difficulty: "",
    p_notes: "",
  });
});

it.each([
  { ownerId: null, description: "an empty slot" },
  { ownerId: 9, description: "another Officer's slot" },
])(
  "rejects an Officer editing $description before calling the RPC",
  async ({ ownerId }) => {
    slotEvent = { event_id: 12, officer_id: ownerId };
    const result = await updatePresenterSlotDetails(
      initial,
      form({ slot_id: "3", presentation_title: "Not mine" }),
    );

    expect(result.error).toBe(
      "Cannot manage another officer presenter slot for this event",
    );
    expect(rpc).not.toHaveBeenCalled();
  },
);

it("rejects an invalid resource link before calling the RPC", async () => {
  asIntroLead();
  const result = await updatePresenterSlotDetails(
    initial,
    form({ slot_id: "3", resource_url: "not a link" }),
  );
  expect(result.error).toBe("Enter a valid HTTP or HTTPS URL");
  expect(result.fieldErrors?.resource_url).toBe(
    "Enter a valid HTTP or HTTPS URL",
  );
  expect(result.values?.resource_url).toBe("not a link");
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects malformed slot IDs before calling the RPC", async () => {
  const result = await changePresenterSlot(
    initial,
    form({ slot_id: "3x", release: "false" }),
  );
  expect(result.error).toBe("Select a valid presenter slot");
  expect(rpc).not.toHaveBeenCalled();
});
