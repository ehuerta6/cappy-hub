import { createHash } from "node:crypto";

export type CalendarMirrorEvent = {
  id: number;
  name: string;
  description: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  deleted_at: string | null;
};

export type GoogleCalendarEvent = {
  id: string;
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: "America/Denver" };
  end: { dateTime: string; timeZone: "America/Denver" };
  status: "confirmed";
  transparency: "opaque" | "transparent";
  guestsCanInviteOthers: false;
  guestsCanModify: false;
  guestsCanSeeOtherGuests: false;
  source: { title: "Cappy Hub"; url: string };
};

export function googleCalendarEventId(eventId: number): string {
  // Google accepts lowercase base32hex characters. SHA-256 hex is a valid,
  // deterministic identifier and keeps Cappy Hub's numeric IDs private.
  return createHash("sha256")
    .update(`cappy-hub-event:${eventId}`)
    .digest("hex");
}

export function isEligibleForCalendarMirror(
  event: CalendarMirrorEvent | null,
): event is CalendarMirrorEvent {
  return Boolean(
    event &&
    event.deleted_at === null &&
    (event.status === "upcoming" ||
      event.status === "happening" ||
      event.status === "cancelled"),
  );
}

export function buildGoogleCalendarEvent(
  event: CalendarMirrorEvent,
  appUrl: string,
): GoogleCalendarEvent {
  const cancelled = event.status === "cancelled";
  const description = safeDescription(event.description);
  const eventUrl = `${appUrl.replace(/\/$/, "")}/events/${event.id}`;
  const linkLine = `Open this protected Event in Cappy Hub: ${eventUrl}`;

  return {
    id: googleCalendarEventId(event.id),
    summary: cancelled ? `Cancelled: ${event.name}` : event.name,
    description: description ? `${description}\n\n${linkLine}` : linkLine,
    ...(event.location ? { location: event.location } : {}),
    start: {
      dateTime: new Date(event.starts_at).toISOString(),
      timeZone: "America/Denver",
    },
    end: {
      dateTime: new Date(event.ends_at).toISOString(),
      timeZone: "America/Denver",
    },
    status: "confirmed",
    transparency: cancelled ? "transparent" : "opaque",
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: false,
    source: { title: "Cappy Hub", url: eventUrl },
  };
}

function safeDescription(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}
