import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
  canManageEvent: (
    actor: { positionName?: string; branchIds?: number[] },
    branches: number[],
  ) =>
    actor.positionName === "President" ||
    (actor.positionName === "Lead" &&
      branches.length > 0 &&
      branches.every((branchId) => actor.branchIds?.includes(branchId))),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  bulkAddEventOfficers,
  restoreEvent,
  saveEvent,
  selfSignup,
} from "@/app/(protected)/events/actions";
import { denverTimestamp } from "@/lib/event-time";

const rpc = vi.fn();
const form = (...ids: string[]) => {
  const data = new FormData();
  data.set("event_id", "12");
  for (const id of ids) data.append("officer_ids", id);
  return data;
};

const eventForm = () => {
  const data = new FormData();
  data.set("name", " CIC meeting ");
  data.set("description", " Agenda ");
  data.set("event_type_id", "2");
  data.set("location", "Campus");
  data.set("event_date", "2026-10-12");
  data.set("start_time", "10:00");
  data.set("end_time", "11:00");
  data.append("branches", "-4");
  data.set("slides_url", " https://example.com/slides ");
  data.set("meeting_notes_url", "");
  data.set("recurrence_request_key", "00000000-0000-4000-8000-000000000001");
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthorizationContext).mockResolvedValue({ id: 8 } as never);
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
  rpc.mockResolvedValue({
    data: {
      added_officer_ids: [3, 4],
      awarded_officer_ids: [3, 4],
      points_per_officer: 5,
    },
    error: null,
  });
});

it("submits a selected officer group to the trusted RPC", async () => {
  const result = await bulkAddEventOfficers(
    { error: "", success: "" },
    form("3", "4", "3"),
  );
  expect(result.error).toBe("");
  expect(result.success).toContain("awarded 2 officers 5 points each");
  expect(rpc).toHaveBeenCalledWith("bulk_add_event_officers", {
    p_event_id: 12,
    p_officer_ids: [3, 4, 3],
  });
});

it("validates the Event ID and restores through the trusted RPC", async () => {
  const data = new FormData();
  data.set("event_id", "12");
  const result = await restoreEvent({ error: "", success: "" }, data);
  expect(result).toEqual({ error: "", success: "Event restored" });
  expect(rpc).toHaveBeenCalledWith("restore_event", { p_event_id: 12 });
  expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
});

it("rejects malformed Event IDs before calling the restore RPC", async () => {
  const data = new FormData();
  data.set("event_id", "12x");
  const result = await restoreEvent({ error: "", success: "" }, data);
  expect(result).toEqual({ error: "Select a valid event", success: "" });
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects malformed Event input before calling the RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
  } as never);
  const invalidEventForm = eventForm();
  invalidEventForm.set("event_date", "October 12");
  const result = await saveEvent({ error: "" }, invalidEventForm);
  expect(result).toEqual({ error: "Choose one event date" });
  expect(rpc).not.toHaveBeenCalled();
});

it("sends validated Event fields to the existing RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
  } as never);
  await saveEvent({ error: "" }, eventForm());
  expect(rpc).toHaveBeenCalledWith("save_event_with_links", {
    p_event_id: undefined,
    p_name: " CIC meeting ",
    p_description: " Agenda ",
    p_event_type_id: 2,
    p_location: "Campus",
    p_event_date: "2026-10-12",
    p_starts_at: denverTimestamp("2026-10-12", "10:00"),
    p_ends_at: denverTimestamp("2026-10-12", "11:00"),
    p_branch_ids: [-4],
    p_slides_url: "https://example.com/slides",
    p_meeting_notes_url: "",
  });
});

it("trims a free-entry location before the trusted Event RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
  } as never);
  const data = eventForm();
  data.set("location", "  CCSB   1.032  ");
  await saveEvent({ error: "" }, data);
  expect(rpc).toHaveBeenCalledWith(
    "save_event_with_links",
    expect.objectContaining({ p_location: "CCSB   1.032" }),
  );
});

it("rejects blank free-entry locations before calling a trusted Event RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
  } as never);
  const data = eventForm();
  data.set("location", "   ");
  const result = await saveEvent({ error: "" }, data);
  expect(result.error).toBe("Name, description and location are required");
  expect(rpc).not.toHaveBeenCalled();
});

it("materializes recurring Events with independent Denver schedules", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
  } as never);
  const recurring = eventForm();
  recurring.set("recurrence_frequency", "daily");
  recurring.set("recurrence_interval", "1");
  recurring.set("recurrence_end_mode", "count");
  recurring.set("recurrence_count", "3");
  await saveEvent({ error: "" }, recurring);
  expect(rpc).toHaveBeenCalledWith(
    "create_recurring_event",
    expect.objectContaining({
      p_recurrence_rule: "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3",
      p_request_key: "00000000-0000-4000-8000-000000000001",
      p_event_dates: ["2026-10-12", "2026-10-13", "2026-10-14"],
      p_starts_at: [
        denverTimestamp("2026-10-12", "10:00"),
        denverTimestamp("2026-10-13", "10:00"),
        denverTimestamp("2026-10-14", "10:00"),
      ],
    }),
  );
});

it("rejects malformed IDs before calling Supabase", async () => {
  const result = await bulkAddEventOfficers(
    { error: "", success: "" },
    form("3x"),
  );
  expect(result.error).toBe("Select valid officers");
  expect(rpc).not.toHaveBeenCalled();
});

it("surfaces trusted database authorization and validation errors", async () => {
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "Event outside branch scope" },
  });
  const result = await bulkAddEventOfficers(
    { error: "", success: "" },
    form("3"),
  );
  expect(result.error).toBe("Event outside branch scope");
});

it("self signup derives identity on the server and revalidates the grouped page", async () => {
  const data = form();
  data.set("officer_id", "999");
  data.set("remove", "true");
  const result = await selfSignup({ error: "", success: "" }, data);
  expect(rpc).toHaveBeenCalledWith("change_event_signup", {
    p_event_id: 12,
    p_officer_id: 8,
    p_remove: false,
  });
  expect(result.error).toBe("");
  expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
});

it("self signup reports closed-event RPC errors without claiming success or revalidating", async () => {
  rpc.mockResolvedValueOnce({
    error: { message: "Signups are closed for this event" },
  });
  const result = await selfSignup({ error: "", success: "" }, form());
  expect(result).toEqual({
    error: "Signups are closed for this event",
    success: "",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});
