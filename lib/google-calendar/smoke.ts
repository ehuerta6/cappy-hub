import { randomInt, randomUUID } from "node:crypto";
import {
  googleEventIdForOccurrence,
  type GoogleEventProjection,
} from "./projection";

type SmokeEvent = {
  status?: string;
  summary?: string;
  start?: { dateTime?: string };
};

type SmokeCalendar = {
  verifyCalendar: () => Promise<void>;
  upsert: (
    event: GoogleEventProjection,
    previousEtag?: string | null,
  ) => Promise<
    | { status: "synced"; etag: string | null; htmlLink: string | null }
    | { status: "superseded" }
  >;
  readOwnedEvent: (
    eventId: string,
    cappyHubEventId: string,
  ) => Promise<SmokeEvent | null>;
  readEventStatus: (eventId: string) => Promise<string | null>;
  delete: (
    eventId: string,
    cappyHubEventId: string,
  ) => Promise<{ status: "removed" }>;
};

export async function runGoogleCalendarApiSmokeTest(calendar: SmokeCalendar) {
  await calendar.verifyCalendar();
  const marker = `smoke:${randomUUID()}`;
  const eventId = googleEventIdForOccurrence(randomInt(1, 2 ** 48));
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const original: GoogleEventProjection = {
    id: eventId,
    status: "confirmed",
    summary: `[CAPPYHUB TEST] ${marker}`,
    description: "Synthetic Calendar API smoke test; no attendees.",
    start: { dateTime: start.toISOString(), timeZone: "America/Denver" },
    end: { dateTime: end.toISOString(), timeZone: "America/Denver" },
    visibility: "default",
    transparency: "opaque",
    extendedProperties: {
      private: { cappyHubEventId: marker, cappyHubGeneration: "1" },
    },
  };
  let createAttempted = false;
  let cleanedUp = false;

  try {
    createAttempted = true;
    const created = await calendar.upsert(original);
    if (created.status !== "synced")
      throw new Error("Synthetic smoke Event ID was already used");
    const readBack = await calendar.readOwnedEvent(eventId, marker);
    if (!readBack || readBack.summary !== original.summary)
      throw new Error("Synthetic smoke Event could not be read back");

    const modified: GoogleEventProjection = {
      ...original,
      summary: `${original.summary} edited`,
      start: {
        dateTime: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
        timeZone: "America/Denver",
      },
      end: {
        dateTime: new Date(end.getTime() + 60 * 60 * 1000).toISOString(),
        timeZone: "America/Denver",
      },
      extendedProperties: {
        private: { cappyHubEventId: marker, cappyHubGeneration: "2" },
      },
    };
    const updated = await calendar.upsert(modified, created.etag);
    if (updated.status !== "synced")
      throw new Error("Synthetic smoke Event update was superseded");
    const modifiedReadBack = await calendar.readOwnedEvent(eventId, marker);
    const actualStartMs = Date.parse(modifiedReadBack?.start?.dateTime ?? "");
    const expectedStartMs = Date.parse(modified.start.dateTime);
    if (
      !modifiedReadBack ||
      modifiedReadBack.summary !== modified.summary ||
      // Google Calendar serializes event times to whole-second precision.
      Math.floor(actualStartMs / 1000) !== Math.floor(expectedStartMs / 1000)
    )
      throw new Error("Synthetic smoke Event modification did not persist");

    await calendar.delete(eventId, marker);
    const afterDelete = await calendar.readEventStatus(eventId);
    if (afterDelete && afterDelete !== "cancelled")
      throw new Error("Synthetic smoke Event cleanup did not persist");
    cleanedUp = true;
    return {
      status: "passed",
      metadata: true,
      create: true,
      read: true,
      update: true,
      delete: true,
    };
  } finally {
    if (createAttempted && !cleanedUp) {
      try {
        await calendar.delete(eventId, marker);
      } catch {
        // Cleanup is limited to this unique marker and reports failure through
        // the smoke request's original error without exposing API payloads.
      }
    }
  }
}
