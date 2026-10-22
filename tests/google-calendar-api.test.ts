import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarApi } from "@/lib/google-calendar/api";
import { runGoogleCalendarApiSmokeTest } from "@/lib/google-calendar/smoke";
import type { GoogleEventProjection } from "@/lib/google-calendar/projection";

const calendarId = "sandbox@example.test";
const body: GoogleEventProjection = {
  id: "ch0123456789abcdefghjkmnpqrs",
  status: "confirmed",
  summary: "Synthetic event",
  description: "Open this Event in Cappy Hub: https://example.test/events/42",
  start: { dateTime: "2027-01-15T17:00:00.000Z", timeZone: "America/Denver" },
  end: { dateTime: "2027-01-15T18:00:00.000Z", timeZone: "America/Denver" },
  visibility: "default",
  transparency: "opaque",
  extendedProperties: {
    private: { cappyHubEventId: "42", cappyHubGeneration: "3" },
  },
};

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

function googleEvent(generation = "3", etag = '"v3"') {
  return {
    id: body.id,
    status: "confirmed",
    etag,
    htmlLink: "https://calendar.google.com/event?eid=synthetic",
    extendedProperties: {
      private: { cappyHubEventId: "42", cappyHubGeneration: generation },
    },
  };
}

describe("Google Calendar API adapter", () => {
  it("uses deterministic insert identity and no attendee updates", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(googleEvent()));
    const api = new GoogleCalendarApi({
      calendarId,
      getAccessToken: async () => "redacted-test-token",
      fetcher,
    });

    await api.upsert(body);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/events?sendUpdates=none");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(body);
    expect(JSON.parse(String(init.body))).not.toHaveProperty("attendees");
  });

  it("recovers an accepted insert after a lost response without duplicating", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { reason: "duplicate" } }, 409),
      )
      .mockResolvedValueOnce(jsonResponse(googleEvent("3", '"v3"')))
      .mockResolvedValueOnce(jsonResponse(googleEvent("3", '"v4"')));
    const api = new GoogleCalendarApi({
      calendarId,
      getAccessToken: async () => "redacted-test-token",
      fetcher,
    });

    const result = await api.upsert(body);

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ status: "synced", etag: '"v4"' });
    expect((fetcher.mock.calls[2]?.[1] as RequestInit).method).toBe("PATCH");
    expect(
      JSON.parse(String((fetcher.mock.calls[2]?.[1] as RequestInit).body)),
    ).not.toHaveProperty("id");
    expect((fetcher.mock.calls[2]?.[1] as RequestInit).headers).toMatchObject({
      "if-match": '"v3"',
    });
  });

  it("does not replay an older generation over a newer remote Event", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { reason: "duplicate" } }, 409),
      )
      .mockResolvedValueOnce(jsonResponse(googleEvent("4", '"v4"')));
    const api = new GoogleCalendarApi({
      calendarId,
      getAccessToken: async () => "redacted-test-token",
      fetcher,
    });

    const result = await api.upsert(body);

    expect(result).toEqual({ status: "superseded" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries an ETag conflict only after re-reading and respects a newer generation", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(googleEvent("3", '"v3"')))
      .mockResolvedValueOnce(jsonResponse({}, 412))
      .mockResolvedValueOnce(jsonResponse(googleEvent("4", '"v4"')));
    const api = new GoogleCalendarApi({
      calendarId,
      getAccessToken: async () => "redacted-test-token",
      fetcher,
    });

    const result = await api.upsert(body, '"v2"');

    expect(result).toEqual({ status: "superseded" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("treats an already missing archived Event as cleaned up", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { reason: "notFound" } }, 404),
      );
    const api = new GoogleCalendarApi({
      calendarId,
      getAccessToken: async () => "redacted-test-token",
      fetcher,
    });

    await expect(api.delete(body.id, "42")).resolves.toEqual({
      status: "removed",
    });
  });

  it("refuses to delete a remote Event without this occurrence ownership marker", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse(googleEvent()));
    const api = new GoogleCalendarApi({
      calendarId,
      getAccessToken: async () => "redacted-test-token",
      fetcher,
    });

    await expect(api.delete(body.id, "another-event")).rejects.toMatchObject({
      reason: "remote_event_identity_mismatch",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reactivates Google's retained cancelled Event after Cappy Hub restore", async () => {
    const deleted = {
      ...googleEvent("3", '"v7"'),
      status: "cancelled",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(deleted))
      .mockResolvedValueOnce(jsonResponse(googleEvent("3", '"v8"')));
    const api = new GoogleCalendarApi({
      calendarId,
      getAccessToken: async () => "redacted-test-token",
      fetcher,
    });

    await api.upsert(body, '"v6"');

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).method).toBe("PATCH");
    expect(
      JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body)),
    ).not.toHaveProperty("id");
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).headers).toMatchObject({
      "if-match": '"v7"',
    });
  });

  it("rejects a calendar identity mismatch", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "other-calendar" }));
    const api = new GoogleCalendarApi({
      calendarId,
      getAccessToken: async () => "redacted-test-token",
      fetcher,
    });

    await expect(api.verifyCalendar()).rejects.toMatchObject({
      reason: "calendar_identity_mismatch",
    });
  });

  it("verifies an explicitly shared calendar without a CalendarList entry", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: calendarId }));

    await new GoogleCalendarApi({
      calendarId,
      getAccessToken: async () => "redacted-test-token",
      fetcher,
    }).verifyCalendar();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toContain(
      `/calendars/${encodeURIComponent(calendarId)}`,
    );
  });

  it("does not make an API request after token acquisition fails", async () => {
    const fetcher = vi.fn();
    const api = new GoogleCalendarApi({
      calendarId,
      getAccessToken: async () => {
        throw new Error("credential source denied");
      },
      fetcher,
    });

    await expect(api.verifyCalendar()).rejects.toThrow(
      "credential source denied",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("smokes metadata, create, read, modify, and owned cleanup in order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T18:15:42.391Z"));
    const calls: string[] = [];
    let current: {
      summary: string;
      start: { dateTime: string };
      status: string;
    } | null = null;
    const calendar = {
      verifyCalendar: vi.fn(async () => void calls.push("metadata")),
      upsert: vi.fn(async (event: typeof body, etag?: string | null) => {
        calls.push(etag ? "modify" : "create");
        const googleStart = new Date(event.start.dateTime);
        googleStart.setUTCMilliseconds(0);
        current = {
          summary: event.summary,
          start: { dateTime: googleStart.toISOString().replace("Z", "+00:00") },
          status: "confirmed",
        };
        return { status: "synced" as const, etag: '"v1"', htmlLink: null };
      }),
      readOwnedEvent: vi.fn(async () => {
        calls.push("read");
        return current;
      }),
      readEventStatus: vi.fn(async () => {
        calls.push("read-status");
        return current?.status ?? null;
      }),
      delete: vi.fn(async () => {
        calls.push("delete");
        current = { ...current!, status: "cancelled" };
        return { status: "removed" as const };
      }),
    };

    await expect(
      runGoogleCalendarApiSmokeTest(calendar),
    ).resolves.toMatchObject({
      status: "passed",
      create: true,
      read: true,
      update: true,
      delete: true,
    });
    expect(calls).toEqual([
      "metadata",
      "create",
      "read",
      "modify",
      "read",
      "delete",
      "read-status",
    ]);
  });
});
