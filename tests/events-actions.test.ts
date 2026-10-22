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
vi.mock("@/lib/google-calendar-sync", () => ({
  syncGoogleCalendarEvents: vi.fn().mockResolvedValue(true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { syncGoogleCalendarEvents } from "@/lib/google-calendar-sync";
import {
  bulkAddEventOfficers,
  cancelEvent,
  removeEvent,
  restoreEvent,
  restoreEventArchive,
  saveEvent,
  selfSignup,
} from "@/app/(protected)/events/actions";
import { denverTimestamp } from "@/lib/event-time";

const rpc = vi.fn();
const from = vi.fn(() => {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    maybeSingle: async () => ({
      data: {
        recurrence_series_id: 3,
        recurrence_key: "2026-10-12",
      },
      error: null,
    }),
    single: async () => ({
      data: { recurrence_series_id: 3 },
      error: null,
    }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [
          { id: 12, recurrence_key: "2026-10-12" },
          { id: 13, recurrence_key: "2026-10-13" },
          { id: 14, recurrence_key: "2026-10-14" },
        ],
        error: null,
      }).then(resolve),
  };
  return query;
});
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
  data.set("signup_sheet_url", " https://example.com/signup ");
  data.set("recurrence_request_key", "00000000-0000-4000-8000-000000000001");
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(syncGoogleCalendarEvents).mockResolvedValue(true);
  vi.mocked(getAuthorizationContext).mockResolvedValue({ id: 8 } as never);
  vi.mocked(createClient).mockResolvedValue({ rpc, from } as never);
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

it("restores an archived Event through the archive restore RPC", async () => {
  const data = new FormData();
  data.set("event_id", "12");
  expect(await restoreEventArchive({ error: "", success: "" }, data)).toEqual({
    error: "",
    success: "Event restored",
  });
  expect(rpc).toHaveBeenCalledWith("restore_event_archive", { p_event_id: 12 });
  expect(syncGoogleCalendarEvents).toHaveBeenCalledWith(
    [12],
    expect.anything(),
  );
});

it("cancels an Event before mirroring its canonical state", async () => {
  const data = new FormData();
  data.set("event_id", "12");

  expect(await cancelEvent({ error: "", success: "" }, data)).toEqual({
    error: "",
    success: "Event cancelled",
  });
  expect(rpc).toHaveBeenCalledWith("cancel_event", { p_event_id: 12 });
  expect(syncGoogleCalendarEvents).toHaveBeenCalledWith(
    [12],
    expect.anything(),
  );
});

it("archives an Event before deleting its Google representation", async () => {
  const data = new FormData();
  data.set("event_id", "12");

  expect(await removeEvent({ error: "", success: "" }, data)).toEqual({
    error: "",
    success: "Event archived",
  });
  expect(rpc).toHaveBeenCalledWith("remove_event", { p_event_id: 12 });
  expect(syncGoogleCalendarEvents).toHaveBeenCalledWith(
    [12],
    expect.anything(),
  );
});

it("rejects malformed Event input before calling the RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
    positionCode: "president",
  } as never);
  const invalidEventForm = eventForm();
  invalidEventForm.set("event_date", "October 12");
  const result = await saveEvent({ error: "", success: "" }, invalidEventForm);
  expect(result).toMatchObject({
    error: "Choose one event date",
    fieldErrors: { event_date: "Choose one event date" },
    values: { event_date: "October 12" },
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("sends validated Event fields to the existing RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
    positionCode: "president",
  } as never);
  const data = eventForm();
  data.set("returnTo", "/events?q=meeting&branch=2");
  rpc.mockResolvedValueOnce({ data: 12, error: null });
  await saveEvent({ error: "", success: "" }, data);
  expect(rpc).toHaveBeenCalledWith("save_event_with_capacity_and_time_slots", {
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
    p_signup_sheet_url: "https://example.com/signup",
    p_max_volunteers: 0,
    p_time_slots: null,
  });
  expect(redirect).toHaveBeenCalledWith(
    "/events/12?returnTo=%2Fevents%3Fq%3Dmeeting%26branch%3D2&feedback=event-saved",
  );
});

it("saves an Event before reporting that Google Calendar could not be updated", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
    positionCode: "president",
  } as never);
  rpc.mockResolvedValueOnce({ data: 42, error: null });
  vi.mocked(syncGoogleCalendarEvents).mockResolvedValueOnce(false);

  const result = await saveEvent({ error: "", success: "" }, eventForm());

  expect(rpc).toHaveBeenCalledWith(
    "save_event_with_capacity_and_time_slots",
    expect.objectContaining({ p_event_id: undefined }),
  );
  expect(syncGoogleCalendarEvents).toHaveBeenCalledWith(
    [42],
    expect.anything(),
  );
  expect(result.error).toBe(
    "Cappy Hub saved this Event, but Google Calendar could not be updated.",
  );
  expect(redirect).not.toHaveBeenCalled();
});

it("uses per-slot capacity instead of Event capacity for a slotted Event", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
    positionCode: "president",
  } as never);
  const data = eventForm();
  data.set("max_volunteers", "2");
  data.set(
    "time_slots",
    JSON.stringify([{ start_time: "10:00", end_time: "11:00", capacity: 5 }]),
  );

  await saveEvent({ error: "", success: "" }, data);

  expect(rpc).toHaveBeenCalledWith(
    "save_event_with_capacity_and_time_slots",
    expect.objectContaining({
      p_max_volunteers: 0,
      p_time_slots: [{ start_time: "10:00", end_time: "11:00", capacity: 5 }],
    }),
  );
});

it("trims a free-entry location before the trusted Event RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
    positionCode: "president",
  } as never);
  const data = eventForm();
  data.set("location", "  CCSB   1.032  ");
  await saveEvent({ error: "", success: "" }, data);
  expect(rpc).toHaveBeenCalledWith(
    "save_event_with_capacity_and_time_slots",
    expect.objectContaining({ p_location: "CCSB   1.032" }),
  );
  expect(rpc).toHaveBeenCalledTimes(1);
});

it("rejects blank free-entry locations before calling a trusted Event RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
    positionCode: "president",
  } as never);
  const data = eventForm();
  data.set("location", "   ");
  const result = await saveEvent({ error: "", success: "" }, data);
  expect(result).toMatchObject({
    error: "Enter an event location",
    fieldErrors: { location: "Enter an event location" },
    values: { location: "   " },
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("materializes recurring Events with independent Denver schedules", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
    positionCode: "president",
  } as never);
  const recurring = eventForm();
  recurring.set("recurrence_frequency", "daily");
  recurring.set("recurrence_interval", "1");
  recurring.set("recurrence_end_mode", "count");
  recurring.set("recurrence_count", "3");
  await saveEvent({ error: "", success: "" }, recurring);
  expect(rpc).toHaveBeenCalledWith(
    "create_recurring_event_with_capacity_and_time_slots",
    expect.objectContaining({
      p_recurrence_rule: "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3",
      p_request_key: "00000000-0000-4000-8000-000000000001",
      p_signup_sheet_url: "https://example.com/signup",
      p_max_volunteers: 0,
      p_event_dates: ["2026-10-12", "2026-10-13", "2026-10-14"],
      p_starts_at: [
        denverTimestamp("2026-10-12", "10:00"),
        denverTimestamp("2026-10-13", "10:00"),
        denverTimestamp("2026-10-14", "10:00"),
      ],
    }),
  );
});

it("rejects an invalid signup sheet URL before calling the trusted RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 8,
    positionName: "President",
    positionCode: "president",
  } as never);
  const data = eventForm();
  data.set("signup_sheet_url", "javascript:alert(1)");
  const result = await saveEvent({ error: "", success: "" }, data);
  expect(result).toMatchObject({ error: "Enter a valid HTTP or HTTPS URL" });
  expect(rpc).not.toHaveBeenCalled();
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
  expect(syncGoogleCalendarEvents).not.toHaveBeenCalled();
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
    values: { event_id: "12", officer_id: "8", remove: "" },
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

it.each(["occurrence", "following", "series"] as const)(
  "edits only the changed Location and Branches through the %s recurring Event scope",
  async (scope) => {
    const data = eventForm();
    data.set("id", "12");
    data.set("scope", scope);
    data.set("recurrence_series_id", "3");
    data.set("recurrence_revision", "2");
    data.set("mutation_request_key", "00000000-0000-4000-8000-000000000068");
    data.append("edited_fields", "location");
    data.append("edited_fields", "branch_ids");
    await saveEvent({ error: "", success: "" }, data);
    expect(rpc).toHaveBeenCalledWith(
      "mutate_recurring_event_with_capacity_and_time_slots",
      {
        p_selected_id: 12,
        p_scope: scope,
        p_operation: "edit",
        p_series_id: 3,
        p_revision: 2,
        p_request_key: "00000000-0000-4000-8000-000000000068",
        p_patch: { location: "Campus", branch_ids: [-4] },
      },
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "save_event_with_links",
      expect.anything(),
    );
    expect(syncGoogleCalendarEvents).toHaveBeenCalledWith(
      scope === "occurrence" ? [12] : [12, 13, 14],
      expect.anything(),
    );
  },
);

it.each([false, true])(
  "Event edit retains list context after save (recurring=%s)",
  async (recurring) => {
    const data = eventForm();
    data.set("id", "12");
    data.set("returnTo", "/events?q=meeting&branch=2&status=upcoming");
    if (recurring) {
      data.set("scope", "series");
      data.set("recurrence_series_id", "3");
      data.set("recurrence_revision", "2");
      data.set("mutation_request_key", "00000000-0000-4000-8000-000000000068");
      data.append("edited_fields", "name");
    }
    rpc.mockResolvedValue({ data: 12, error: null });
    await saveEvent({ error: "", success: "" }, data);
    expect(redirect).toHaveBeenCalledWith(
      "/events/12?returnTo=%2Fevents%3Fq%3Dmeeting%26branch%3D2%26status%3Dupcoming&feedback=event-saved",
    );
    expect(rpc).toHaveBeenCalledWith(
      recurring
        ? "mutate_recurring_event_with_capacity_and_time_slots"
        : "save_event_with_capacity_and_time_slots",
      expect.not.objectContaining({ returnTo: expect.anything() }),
    );
  },
);

it.each([
  undefined,
  "https://evil.example",
  "//evil.example",
  "/events/12?returnTo=%2Fevents",
  "/events?q=%",
])(
  "Event save drops invalid or missing return context: %s",
  async (returnTo) => {
    const data = eventForm();
    data.set("id", "12");
    if (returnTo) data.set("returnTo", returnTo);
    rpc.mockResolvedValue({ data: 12, error: null });
    await saveEvent({ error: "", success: "" }, data);
    expect(redirect).toHaveBeenCalledWith("/events/12?feedback=event-saved");
  },
);

it("a contextual edit still surfaces the Event RPC authorization denial without redirecting", async () => {
  const data = eventForm();
  data.set("id", "12");
  data.set("returnTo", "/events?branch=2");
  rpc.mockResolvedValue({ error: { message: "Event outside branch scope" } });
  expect(
    (await saveEvent({ error: "", success: "" }, data)).error,
  ).toBeTruthy();
  expect(rpc).toHaveBeenCalledWith(
    "save_event_with_capacity_and_time_slots",
    expect.objectContaining({ p_event_id: 12 }),
  );
  expect(redirect).not.toHaveBeenCalled();
});
