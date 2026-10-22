import { describe, expect, it } from "vitest";
import {
  buildCalendarProjection,
  googleEventIdForOccurrence,
  validateLocalCalendarEnvironment,
} from "@/lib/google-calendar/projection";

const baseEvent = {
  id: 42,
  name: "Synthetic Workshop",
  description: "Internal notes: use door code 123456",
  location: "Private room, entry code 123456",
  starts_at: "2027-01-15T17:00:00.000Z",
  ends_at: "2027-01-15T18:00:00.000Z",
  status: "upcoming",
  deleted_at: null,
};

const appOrigin = "https://cappy.example";
const now = new Date("2027-01-01T00:00:00.000Z");

describe("Google Calendar occurrence projection", () => {
  it("uses stable Calendar-safe IDs and keeps each occurrence independent", () => {
    const first = googleEventIdForOccurrence(42);
    expect(first).toBe(googleEventIdForOccurrence(42));
    expect(first).not.toBe(googleEventIdForOccurrence(43));
    expect(first).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it("supports negative IDs used by synthetic local Events", () => {
    const first = googleEventIdForOccurrence(-2010);
    expect(first).toBe(googleEventIdForOccurrence(-2010));
    expect(first).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(first).not.toBe(googleEventIdForOccurrence(2010));
  });

  it("publishes the approved safe fields and omits free text and attendees", () => {
    const result = buildCalendarProjection(baseEvent, {
      appOrigin,
      now,
      wasRemoteVisible: false,
      generation: 7,
    });

    expect(result).toMatchObject({
      action: "upsert",
      body: {
        id: googleEventIdForOccurrence(42),
        summary: "Synthetic Workshop",
        start: {
          dateTime: "2027-01-15T17:00:00.000Z",
          timeZone: "America/Denver",
        },
        end: {
          dateTime: "2027-01-15T18:00:00.000Z",
          timeZone: "America/Denver",
        },
        description:
          "Open this Event in Cappy Hub:\nhttps://cappy.example/events/42",
        visibility: "default",
        transparency: "opaque",
        extendedProperties: {
          private: {
            cappyHubEventId: "42",
            cappyHubGeneration: "7",
          },
        },
      },
    });
    expect(result.action === "upsert" && result.body).not.toHaveProperty(
      "location",
    );
    expect(result.action === "upsert" && result.body).not.toHaveProperty(
      "attendees",
    );
    expect(JSON.stringify(result)).not.toContain("123456");
  });

  it("labels current cancelled occurrences and makes them transparent", () => {
    const result = buildCalendarProjection(
      { ...baseEvent, status: "cancelled" },
      { appOrigin, now, wasRemoteVisible: false, generation: 1 },
    );
    expect(result.action).toBe("upsert");
    if (result.action !== "upsert") return;
    expect(result.body.summary).toBe("[CANCELLED] Synthetic Workshop");
    expect(result.body.transparency).toBe("transparent");
  });

  it("preserves Denver instants across a daylight-saving transition", () => {
    const result = buildCalendarProjection(
      {
        ...baseEvent,
        starts_at: "2027-03-14T08:30:00.000Z",
        ends_at: "2027-03-14T09:30:00.000Z",
      },
      { appOrigin, now, wasRemoteVisible: false, generation: 1 },
    );
    expect(result.action).toBe("upsert");
    if (result.action !== "upsert") return;
    expect(result.body.start).toEqual({
      dateTime: "2027-03-14T08:30:00.000Z",
      timeZone: "America/Denver",
    });
    expect(result.body.end).toEqual({
      dateTime: "2027-03-14T09:30:00.000Z",
      timeZone: "America/Denver",
    });
  });

  it("removes archived remote Events while retaining a stable occurrence ID", () => {
    const result = buildCalendarProjection(
      { ...baseEvent, deleted_at: "2026-12-30T00:00:00Z" },
      { appOrigin, now, wasRemoteVisible: true, generation: 2 },
    );
    expect(result).toEqual({
      action: "delete",
      eventId: googleEventIdForOccurrence(42),
    });
  });

  it("checks the deterministic ID when an archived Event has no saved remote mapping", () => {
    expect(
      buildCalendarProjection(
        { ...baseEvent, deleted_at: "2026-12-30T00:00:00Z" },
        { appOrigin, now, wasRemoteVisible: false, generation: 2 },
      ),
    ).toEqual({
      action: "delete",
      eventId: googleEventIdForOccurrence(42),
    });
  });

  it("does not import historical Events unless they already have a remote mapping", () => {
    const oldEvent = {
      ...baseEvent,
      starts_at: "2026-12-01T17:00:00.000Z",
      ends_at: "2026-12-01T18:00:00.000Z",
    };
    expect(
      buildCalendarProjection(oldEvent, {
        appOrigin,
        now,
        wasRemoteVisible: false,
        generation: 1,
      }),
    ).toEqual({ action: "skip" });
    expect(
      buildCalendarProjection(oldEvent, {
        appOrigin,
        now,
        wasRemoteVisible: true,
        generation: 1,
      }).action,
    ).toBe("upsert");
  });

  it("does not republish a past Event when its archived entry was already removed", () => {
    const oldEvent = {
      ...baseEvent,
      starts_at: "2026-12-01T17:00:00.000Z",
      ends_at: "2026-12-01T18:00:00.000Z",
    };
    expect(
      buildCalendarProjection(oldEvent, {
        appOrigin,
        now,
        wasRemoteVisible: false,
        generation: 3,
      }),
    ).toEqual({ action: "skip" });
  });

  it("rejects non-local, non-test, or mismatched publisher environments", () => {
    const valid = {
      mode: "local-test",
      nodeEnv: "development",
      vercelEnv: undefined,
      supabaseUrl: "http://127.0.0.1:54321",
      calendarId: "configured-test-calendar",
      credentialEmail:
        "cappyhub-calendar-local@cappy-hub.iam.gserviceaccount.com",
    };
    expect(validateLocalCalendarEnvironment(valid)).toEqual({ ok: true });
    expect(
      validateLocalCalendarEnvironment({ ...valid, nodeEnv: "production" }).ok,
    ).toBe(false);
    expect(
      validateLocalCalendarEnvironment({ ...valid, vercelEnv: "production" })
        .ok,
    ).toBe(false);
    expect(validateLocalCalendarEnvironment({ ...valid, ci: "true" }).ok).toBe(
      false,
    );
    expect(
      validateLocalCalendarEnvironment({
        ...valid,
        supabaseUrl: "https://production.supabase.co",
      }).ok,
    ).toBe(false);
    expect(
      validateLocalCalendarEnvironment({
        ...valid,
        credentialEmail: "someone@gmail.com",
      }).ok,
    ).toBe(false);
  });
});
