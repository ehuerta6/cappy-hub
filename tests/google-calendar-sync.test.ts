import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  googleCalendarEventId,
  type CalendarMirrorEvent,
} from "@/lib/google-calendar-event";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  accessToken: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  recordResults: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/google-calendar-auth", () => ({
  googleCalendarSyncEnabled: mocks.enabled,
  googleCalendarAccessToken: mocks.accessToken,
}));
vi.mock("@/lib/google-calendar-api", () => ({
  GoogleCalendarApiError: class GoogleCalendarApiError extends Error {
    constructor(
      readonly status: number | null,
      message: string,
    ) {
      super(message);
    }
  },
  GoogleCalendarApi: class {
    upsert = mocks.upsert;
    remove = mocks.remove;
    constructor() {}
  },
}));

import { syncGoogleCalendarEvents } from "@/lib/google-calendar-sync";

const event: CalendarMirrorEvent = {
  id: 42,
  name: "Synthetic club meeting",
  description: "Agenda",
  location: "Test campus",
  starts_at: "2099-10-01T16:00:00.000Z",
  ends_at: "2099-10-01T17:00:00.000Z",
  status: "upcoming",
  deleted_at: null,
};

function setEvents(data: Array<typeof event> | (() => Array<typeof event>)) {
  const currentEvents = () => (typeof data === "function" ? data() : data);
  return {
    from: () => ({
      select: () => ({
        eq: (_column: string, id: number) => ({
          maybeSingle: async () => ({
            data: currentEvents().find((row) => row.id === id) ?? null,
            error: null,
          }),
        }),
        in: () => Promise.resolve({ data: currentEvents(), error: null }),
      }),
    }),
    rpc: (...args: unknown[]) => mocks.recordResults(...args),
  } as never;
}

describe("direct Google Calendar Event synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CALENDAR_ID", "synthetic-calendar");
    vi.stubEnv("CAPPYHUB_APP_URL", "https://cappy.example");
    mocks.enabled.mockReturnValue(true);
    mocks.accessToken.mockResolvedValue("synthetic-token");
    mocks.upsert.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    mocks.recordResults.mockResolvedValue({ error: null });
    setEvents([event]);
  });

  it("loads canonical state and updates the stable Google event ID", async () => {
    const supabase = setEvents([event]);
    await expect(syncGoogleCalendarEvents([42, 42], supabase)).resolves.toBe(
      true,
    );

    expect(mocks.accessToken).toHaveBeenCalledWith("synthetic-calendar");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: googleCalendarEventId(42),
        summary: "Synthetic club meeting",
        location: "Test campus",
      }),
    );
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("deletes the stable Google event when the canonical Event is archived", async () => {
    const supabase = setEvents([]);

    await expect(syncGoogleCalendarEvents([42], supabase)).resolves.toBe(true);

    expect(mocks.remove).toHaveBeenCalledWith(googleCalendarEventId(42));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not call Google in Preview, ordinary local development, or CI", async () => {
    mocks.enabled.mockReturnValue(false);

    await expect(
      syncGoogleCalendarEvents([42], setEvents([event])),
    ).resolves.toBe(true);

    expect(mocks.accessToken).not.toHaveBeenCalled();
    expect(mocks.recordResults).not.toHaveBeenCalled();
  });

  it("records only failed occurrences after a partial recurring sync", async () => {
    const second = { ...event, id: 43, name: "Second occurrence" };
    mocks.upsert
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("synthetic outage"));

    await expect(
      syncGoogleCalendarEvents([42, 43], setEvents([event, second])),
    ).resolves.toBe(false);

    expect(mocks.recordResults).toHaveBeenCalledWith(
      "record_google_calendar_sync_results",
      {
        p_event_ids: [42, 43],
        p_failed_event_ids: [43],
        p_expected_states: { 42: event, 43: second },
      },
    );
  });

  it("recovery reads a deleted Event's current state and removes its stable ID", async () => {
    await expect(
      syncGoogleCalendarEvents(
        [42],
        setEvents([{ ...event, deleted_at: "2026-10-31T00:00:00Z" }]),
      ),
    ).resolves.toBe(true);

    expect(mocks.remove).toHaveBeenCalledWith(googleCalendarEventId(42));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("follows an in-flight upsert with a removal when the Event is now deleted", async () => {
    const canonical = [event];
    mocks.upsert.mockImplementationOnce(async () => {
      canonical[0] = {
        ...event,
        deleted_at: "2026-10-31T00:00:00Z",
      };
    });

    await expect(
      syncGoogleCalendarEvents(
        [42],
        setEvents(() => canonical),
      ),
    ).resolves.toBe(true);

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith(googleCalendarEventId(42));
    expect(mocks.recordResults).toHaveBeenCalledWith(
      "record_google_calendar_sync_results",
      {
        p_event_ids: [42],
        p_failed_event_ids: [],
        p_expected_states: {
          42: { ...event, deleted_at: "2026-10-31T00:00:00Z" },
        },
      },
    );
  });

  it("reports Google failures without throwing into the saved Cappy Hub change", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.upsert.mockRejectedValueOnce(new Error("synthetic Google outage"));

    await expect(
      syncGoogleCalendarEvents([42], setEvents([event])),
    ).resolves.toBe(false);

    expect(log).toHaveBeenCalledWith("Google Calendar Event update failed", {
      failedEvents: 1,
      reason: "Google Calendar synchronization failed",
    });
    log.mockRestore();
  });

  it("keeps a failed attempt tied to the Event state it actually sent", async () => {
    const canonical = [event];
    mocks.upsert.mockImplementationOnce(async () => {
      canonical[0] = { ...event, name: "New canonical name" };
      throw new Error("synthetic outage");
    });

    await expect(
      syncGoogleCalendarEvents(
        [42],
        setEvents(() => canonical),
      ),
    ).resolves.toBe(false);

    expect(mocks.recordResults).toHaveBeenCalledWith(
      "record_google_calendar_sync_results",
      {
        p_event_ids: [42],
        p_failed_event_ids: [42],
        p_expected_states: { 42: event },
      },
    );
  });
});
