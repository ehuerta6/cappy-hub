import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  buildGoogleCalendarEvent,
  googleCalendarEventId,
  isEligibleForCalendarMirror,
  type CalendarMirrorEvent,
} from "@/lib/google-calendar-event";
import {
  GoogleCalendarApi,
  GoogleCalendarApiError,
} from "@/lib/google-calendar-api";
import { syncGoogleCalendarEvent } from "@/lib/google-calendar-sync";

const event: CalendarMirrorEvent = {
  id: 42,
  name: "CIC session",
  description: "Agenda <b>and topics</b>\u0001",
  location: "Campus",
  starts_at: "2026-03-08T15:00:00.000Z",
  ends_at: "2026-03-08T16:00:00.000Z",
  status: "upcoming",
  deleted_at: null,
};

describe("Google Calendar Event representation", () => {
  it("uses stable Google identity and publishes only the club Event fields", () => {
    const first = buildGoogleCalendarEvent(event, "https://cappy.example/");
    const second = buildGoogleCalendarEvent(event, "https://cappy.example");

    expect(first).toEqual(second);
    expect(first.id).toMatch(/^[0-9a-f]{64}$/);
    expect(googleCalendarEventId(42)).toBe(first.id);
    expect(first).toMatchObject({
      summary: "CIC session",
      location: "Campus",
      description:
        "Agenda and topics\n\nOpen this protected Event in Cappy Hub: https://cappy.example/events/42",
      start: {
        dateTime: "2026-03-08T15:00:00.000Z",
        timeZone: "America/Denver",
      },
      end: { dateTime: "2026-03-08T16:00:00.000Z", timeZone: "America/Denver" },
      status: "confirmed",
      transparency: "opaque",
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      guestsCanSeeOtherGuests: false,
      source: { title: "Cappy Hub", url: "https://cappy.example/events/42" },
    });
    expect(first).not.toHaveProperty("attendees");
    expect(first.description).not.toContain("<b>");
  });

  it("keeps cancelled Events visible and free", () => {
    const cancelled = buildGoogleCalendarEvent(
      { ...event, status: "cancelled" },
      "https://cappy.example",
    );
    expect(isEligibleForCalendarMirror({ ...event, status: "cancelled" })).toBe(
      true,
    );
    expect(cancelled.summary).toBe("Cancelled: CIC session");
    expect(cancelled.status).toBe("confirmed");
    expect(cancelled.transparency).toBe("transparent");
  });

  it("keeps Denver wall-clock times through the spring DST offset", () => {
    const spring = buildGoogleCalendarEvent(
      {
        ...event,
        starts_at: "2026-03-08T16:00:00.000Z",
        ends_at: "2026-03-08T17:00:00.000Z",
      },
      "https://cappy.example",
    );
    expect(spring.start).toEqual({
      dateTime: "2026-03-08T16:00:00.000Z",
      timeZone: "America/Denver",
    });
    const fall = buildGoogleCalendarEvent(
      {
        ...event,
        starts_at: "2026-11-01T16:00:00.000Z",
        ends_at: "2026-11-01T17:00:00.000Z",
      },
      "https://cappy.example",
    );
    expect(fall.start).toEqual({
      dateTime: "2026-11-01T16:00:00.000Z",
      timeZone: "America/Denver",
    });
  });

  it("removes archived and past Events from the mirror", () => {
    expect(
      isEligibleForCalendarMirror({ ...event, deleted_at: "2026-01-01" }),
    ).toBe(false);
    expect(isEligibleForCalendarMirror({ ...event, status: "past" })).toBe(
      false,
    );
  });
});

describe("Google Calendar API operations", () => {
  it("creates by deterministic ID, then updates that same event on retries", async () => {
    const requests: Array<{ url: string; method: string; body?: string }> = [];
    const request = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (init?.method === "GET") return new Response(null, { status: 404 });
      return new Response("{}", {
        status: init?.method === "POST" ? 201 : 200,
        headers: init?.method === "POST" ? {} : { ETag: '"v2"' },
      });
    });
    const api = new GoogleCalendarApi(
      "short-lived-token",
      "test-calendar",
      request,
    );
    const representation = buildGoogleCalendarEvent(
      event,
      "https://cappy.example",
    );

    await api.upsert(representation);
    request.mockImplementationOnce(async (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? "GET" });
      return new Response("{}", {
        status: 200,
        headers: init?.method === "GET" ? { ETag: '"v1"' } : {},
      });
    });
    await api.upsert(representation);

    expect(requests.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
      "PUT",
    ]);
    expect(requests[1].body).toContain(`"id":"${representation.id}"`);
    expect(request.mock.calls[3][1]?.headers).toMatchObject({
      "If-Match": '"v1"',
    });
    expect(
      requests
        .filter(({ method }) => method !== "GET")
        .every(({ url }) => url.includes("sendUpdates=none")),
    ).toBe(true);
  });

  it("treats repeated archive deletes as successful and adds no invite recipients", async () => {
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "GET") {
        return new Response("{}", { status: 200, headers: { ETag: '"v1"' } });
      }
      return new Response(null, { status: 410 });
    });
    const api = new GoogleCalendarApi("token", "test-calendar", request);
    const removeId = googleCalendarEventId(event.id);
    await expect(api.remove(removeId)).resolves.toBeUndefined();
    expect(String(request.mock.calls[1][0])).toContain(
      `/events/${removeId}?sendUpdates=none`,
    );
    expect(request.mock.calls[1][1]?.method).toBe("DELETE");
    expect(request.mock.calls[1][1]?.headers).toMatchObject({
      "If-Match": '"v1"',
    });
  });

  it("rejects an old timed-out update after a newer conditional update wins", async () => {
    let current = { etag: '"v1"', summary: "Initial" };
    let releaseOldPut: (() => void) | undefined;
    let markOldPutStarted: (() => void) | undefined;
    let oldIfMatch: string | null = null;
    const oldPutStarted = new Promise<void>((resolve) => {
      markOldPutStarted = resolve;
    });
    const oldPutResponse = new Promise<Response>((resolve) => {
      releaseOldPut = () => {
        if (oldIfMatch !== current.etag) {
          resolve(new Response(null, { status: 412 }));
        } else {
          current = { etag: '"v3"', summary: "Stale" };
          resolve(
            new Response("{}", {
              status: 200,
              headers: { ETag: current.etag },
            }),
          );
        }
      };
    });
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "GET") {
        return new Response("{}", {
          status: 200,
          headers: { ETag: current.etag },
        });
      }
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body)) as { summary: string };
      if (body.summary === "Stale") {
        oldIfMatch = headers.get("If-Match");
        markOldPutStarted?.();
        return oldPutResponse;
      }
      if (headers.get("If-Match") !== current.etag) {
        return new Response(null, { status: 412 });
      }
      current = { etag: '"v2"', summary: body.summary };
      return new Response("{}", {
        status: 200,
        headers: { ETag: current.etag },
      });
    });
    const api = new GoogleCalendarApi("token", "test-calendar", request);
    const oldUpdate = api.upsert({
      ...buildGoogleCalendarEvent(event, "https://cappy.example"),
      summary: "Stale",
    });
    await oldPutStarted;

    await api.upsert({
      ...buildGoogleCalendarEvent(event, "https://cappy.example"),
      summary: "Latest canonical state",
    });
    releaseOldPut?.();

    await expect(oldUpdate).rejects.toMatchObject({ status: 412 });
    expect(current).toEqual({
      etag: '"v2"',
      summary: "Latest canonical state",
    });
    await expect(oldUpdate).rejects.toBeInstanceOf(GoogleCalendarApiError);
  });

  it("retries a deterministic-ID insert conflict instead of writing stale data", async () => {
    const methods: string[] = [];
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return new Response(null, {
        status: init?.method === "POST" ? 409 : 404,
      });
    });
    const api = new GoogleCalendarApi("token", "test-calendar", request);
    const representation = buildGoogleCalendarEvent(
      event,
      "https://cappy.example",
    );

    await expect(api.upsert(representation)).rejects.toMatchObject({
      status: 409,
    });
    expect(methods).toEqual(["GET", "POST"]);
  });

  it("restores an archived Event by updating its stable Google ID", async () => {
    const request = vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === "GET"
        ? Response.json(
            {
              id: googleCalendarEventId(event.id),
              status: "cancelled",
            },
            { headers: { ETag: '"v1"' } },
          )
        : Response.json({}, { headers: { ETag: '"v2"' } }),
    );
    const calendar = new GoogleCalendarApi("token", "test-calendar", request);
    await syncGoogleCalendarEvent(
      event.id,
      event,
      calendar,
      "https://cappy.example",
    );
    expect(request.mock.calls.map(([, init]) => init?.method)).toEqual([
      "GET",
      "PUT",
    ]);
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toMatchObject({
      id: googleCalendarEventId(event.id),
      status: "confirmed",
      transparency: "opaque",
    });
  });
});
