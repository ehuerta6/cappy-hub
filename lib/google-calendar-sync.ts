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

  let failedIds = ids;
  const expectedStates = new Map<number, CalendarMirrorEvent | null>();
  try {
    const calendarId = required("GOOGLE_CALENDAR_ID");
    const appUrl = canonicalAppUrl(required("CAPPYHUB_APP_URL"));
    const accessToken = await googleCalendarAccessToken(calendarId);
    const calendar = new GoogleCalendarApi(accessToken, calendarId);
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const state = await syncLatestCanonicalEvent(
          id,
          supabase,
          calendar,
          appUrl,
          (attemptedState) => expectedStates.set(id, attemptedState),
        );
        expectedStates.set(id, state);
      }),
    );
    failedIds = ids.filter((_, index) => results[index].status === "rejected");
    if (failedIds.length) {
      const firstFailure = results.find(
        (result) => result.status === "rejected",
      );
      const reason = googleCalendarSyncError(
        firstFailure?.status === "rejected" ? firstFailure.reason : undefined,
      );
      console.error("Google Calendar Event update failed", {
        failedEvents: failedIds.length,
        reason,
      });
    }
  } catch (error) {
    console.error("Google Calendar Event update failed", {
      reason: googleCalendarSyncError(error),
    });
  }

  // Record results only for the exact canonical state they describe. A slow
  // success from an older mutation must not clear a newer failed sync marker.
  for (const id of ids) {
    if (expectedStates.has(id)) continue;
    try {
      expectedStates.set(id, await loadCanonicalEvent(id, supabase));
    } catch (error) {
      console.error("Could not load Event state for Calendar recovery", {
        reason: googleCalendarSyncError(error),
      });
      return false;
    }
  }

  const { error } = await supabase.rpc("record_google_calendar_sync_results", {
    p_event_ids: ids,
    p_failed_event_ids: failedIds,
    p_expected_states: Object.fromEntries(expectedStates),
  });
  if (error) {
    console.error("Could not record Google Calendar sync results", {
      failedEvents: failedIds.length,
    });
    return false;
  }
  return failedIds.length === 0;
}

async function syncLatestCanonicalEvent(
  eventId: number,
  supabase: Awaited<ReturnType<typeof createClient>>,
  calendar: GoogleCalendarApi,
  calendarAppUrl: string,
  onAttempt: (state: CalendarMirrorEvent | null) => void,
): Promise<CalendarMirrorEvent | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const event = await loadCanonicalEvent(eventId, supabase);
    const desired = calendarRepresentation(event, calendarAppUrl);
    onAttempt(event);
    await syncGoogleCalendarEvent(eventId, event, calendar, calendarAppUrl);
    const latest = await loadCanonicalEvent(eventId, supabase);
    if (
      JSON.stringify(calendarRepresentation(latest, calendarAppUrl)) ===
      JSON.stringify(desired)
    )
      return latest;
  }
  throw new Error("Event changed repeatedly during Calendar synchronization");
}

async function loadCanonicalEvent(
  eventId: number,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<CalendarMirrorEvent | null> {
  const { data, error } = await supabase
    .from("events")
    .select(eventFields)
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error("Could not load canonical Event");
  return data;
}

function calendarRepresentation(
  event: CalendarMirrorEvent | null,
  calendarAppUrl: string,
) {
  return isEligibleForCalendarMirror(event)
    ? buildGoogleCalendarEvent(event, calendarAppUrl)
    : null;
}

export function isGoogleCalendarSyncEnabled() {
  return googleCalendarSyncEnabled();
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
