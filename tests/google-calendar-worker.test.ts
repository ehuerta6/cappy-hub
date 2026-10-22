import { describe, expect, it, vi } from "vitest";
import { processGoogleCalendarSyncBatch } from "@/lib/google-calendar/worker";
import { googleEventIdForOccurrence } from "@/lib/google-calendar/projection";
import type { CalendarSyncClaim } from "@/lib/google-calendar/worker";

const queuedEvent = {
  event_id: 42,
  generation: 9,
  lease_token: "00000000-0000-4000-8000-000000000042",
  event_name: "Synthetic Workshop",
  starts_at: "2027-01-15T17:00:00.000Z",
  ends_at: "2027-01-15T18:00:00.000Z",
  event_status: "upcoming",
  archived_at: null,
  was_remote_visible: true,
  google_event_id: googleEventIdForOccurrence(42),
  google_etag: '"v8"',
  google_html_link: "https://calendar.google.com/event?eid=synthetic",
};

function createStore(rows: CalendarSyncClaim[] = [queuedEvent]) {
  return {
    claim: vi.fn().mockResolvedValue(rows),
    complete: vi.fn().mockResolvedValue(true),
    retry: vi.fn().mockResolvedValue(true),
  };
}

describe("durable Google Calendar worker", () => {
  it("reconciles only leased current state and records the same stable occurrence ID", async () => {
    const store = createStore();
    const calendar = {
      verifyCalendar: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn().mockResolvedValue({
        status: "synced",
        etag: '"v9"',
        htmlLink: queuedEvent.google_html_link,
      }),
      delete: vi.fn(),
    };

    const result = await processGoogleCalendarSyncBatch({
      store,
      calendar,
      calendarId: "configured-test-calendar",
      appOrigin: "http://localhost:3000",
      now: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ claimed: 1, synced: 1, removed: 0, failed: 0 });
    expect(calendar.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: queuedEvent.google_event_id }),
      '"v8"',
    );
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 42,
        generation: 9,
        leaseToken: queuedEvent.lease_token,
        state: "synced",
        googleEventId: queuedEvent.google_event_id,
      }),
    );
  });

  it("removes an archived mapped occurrence but keeps its deterministic mapping", async () => {
    const store = createStore([
      { ...queuedEvent, archived_at: "2026-12-30T00:00:00.000Z" },
    ]);
    const calendar = {
      verifyCalendar: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue({ status: "removed" }),
    };

    const result = await processGoogleCalendarSyncBatch({
      store,
      calendar,
      calendarId: "configured-test-calendar",
      appOrigin: "http://localhost:3000",
      now: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(result.removed).toBe(1);
    expect(calendar.delete).toHaveBeenCalledWith(
      queuedEvent.google_event_id,
      String(queuedEvent.event_id),
    );
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "removed",
        googleEventId: queuedEvent.google_event_id,
      }),
    );
  });

  it("keeps failed Google writes pending with a bounded diagnostic code", async () => {
    const store = createStore();
    const calendar = {
      verifyCalendar: vi.fn().mockResolvedValue(undefined),
      upsert: vi
        .fn()
        .mockRejectedValue(new Error("access token: private value")),
      delete: vi.fn(),
    };

    const result = await processGoogleCalendarSyncBatch({
      store,
      calendar,
      calendarId: "configured-test-calendar",
      appOrigin: "http://localhost:3000",
      now: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(result.failed).toBe(1);
    expect(store.retry).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 42, errorCode: "worker_error" }),
    );
    expect(JSON.stringify(store.retry.mock.calls)).not.toContain(
      "private value",
    );
  });

  it("does not acknowledge an out-of-order Google projection", async () => {
    const store = createStore();
    const calendar = {
      verifyCalendar: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn().mockResolvedValue({ status: "superseded" }),
      delete: vi.fn(),
    };

    const result = await processGoogleCalendarSyncBatch({
      store,
      calendar,
      calendarId: "configured-test-calendar",
      appOrigin: "http://localhost:3000",
      now: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(result.failed).toBe(1);
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 42,
        errorCode: "remote_generation_newer",
      }),
    );
  });
});
