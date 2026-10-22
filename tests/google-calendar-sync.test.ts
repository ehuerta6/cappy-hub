import { beforeEach, describe, expect, it, vi } from "vitest";
import { googleCalendarEventId } from "@/lib/google-calendar-event";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  accessToken: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
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

const event = {
  id: 42,
  name: "Synthetic club meeting",
  description: "Agenda",
  location: "Test campus",
  starts_at: "2099-10-01T16:00:00.000Z",
  ends_at: "2099-10-01T17:00:00.000Z",
  status: "upcoming",
  deleted_at: null,
};

function setEvents(data: Array<typeof event>) {
  return {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data, error: null }),
      }),
    }),
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
});
