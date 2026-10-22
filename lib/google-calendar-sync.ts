import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  googleCalendarAccessToken,
  googleCalendarSyncEnabled,
} from "@/lib/google-calendar-auth";
import {
  GoogleCalendarApi,
  GoogleCalendarApiError,
} from "./google-calendar-api";
import {
  googleCalendarEventId,
  isEligibleForCalendarMirror,
  buildGoogleCalendarEvent,
  type CalendarMirrorEvent,
} from "./google-calendar-event";

const eventFields =
  "id,name,description,location,starts_at,ends_at,status,deleted_at";

export async function syncGoogleCalendarEvents(
  eventIds: number[],
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const ids = [...new Set(eventIds)];
  if (!ids.length || !googleCalendarSyncEnabled()) return true;

  try {
    const calendarId = required("GOOGLE_CALENDAR_ID");
    const appUrl = canonicalAppUrl(required("CAPPYHUB_APP_URL"));
    const accessToken = await googleCalendarAccessToken(calendarId);
    const { data, error } = await supabase
      .from("events")
      .select(eventFields)
      .in("id", ids);
    if (error) throw new Error("Could not load canonical Events");

    const events = new Map<number, CalendarMirrorEvent>(
      (data ?? []).map((event) => [event.id, event]),
    );
    const calendar = new GoogleCalendarApi(accessToken, calendarId);
    const results = await Promise.allSettled(
      ids.map((id) =>
        syncGoogleCalendarEvent(id, events.get(id) ?? null, calendar, appUrl),
      ),
    );
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      const reason = googleCalendarSyncError(failed[0].reason);
      console.error("Google Calendar Event update failed", {
        failedEvents: failed.length,
        reason,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Google Calendar Event update failed", {
      reason: googleCalendarSyncError(error),
    });
    return false;
  }
}

export async function syncGoogleCalendarEvent(
  eventId: number,
  event: CalendarMirrorEvent | null,
  calendar: GoogleCalendarApi,
  calendarAppUrl: string,
): Promise<void> {
  if (!isEligibleForCalendarMirror(event)) {
    await calendar.remove(googleCalendarEventId(eventId));
    return;
  }
  await calendar.upsert(buildGoogleCalendarEvent(event, calendarAppUrl));
}

export function googleCalendarSyncError(error: unknown): string {
  if (error instanceof GoogleCalendarApiError) return error.message;
  if (error instanceof Error && error.message.startsWith("Missing ")) {
    return error.message;
  }
  return "Google Calendar synchronization failed";
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function canonicalAppUrl(value: string): string {
  const url = new URL(value);
  const local =
    process.env.NODE_ENV !== "production" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !local)
  ) {
    throw new Error("CAPPYHUB_APP_URL must be a canonical HTTPS origin");
  }
  return url.origin;
}
