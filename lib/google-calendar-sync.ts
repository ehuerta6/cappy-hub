import {
  buildGoogleCalendarEvent,
  googleCalendarEventId,
  isEligibleForCalendarMirror,
  type CalendarMirrorEvent,
} from "./google-calendar-event";
import {
  GoogleCalendarApi,
  GoogleCalendarApiError,
} from "./google-calendar-api";

export type GoogleCalendarSyncJob = { event_id: number; revision: number };

export async function syncGoogleCalendarJob(
  job: GoogleCalendarSyncJob,
  dependencies: {
    loadEvent: (eventId: number) => Promise<CalendarMirrorEvent | null>;
    calendar: GoogleCalendarApi;
    calendarAppUrl: string;
  },
): Promise<void> {
  const event = await dependencies.loadEvent(job.event_id);
  if (!isEligibleForCalendarMirror(event)) {
    await dependencies.calendar.remove(googleCalendarEventId(job.event_id));
    return;
  }
  await dependencies.calendar.upsert(
    buildGoogleCalendarEvent(event, dependencies.calendarAppUrl),
  );
}

export function googleCalendarSyncError(error: unknown): string {
  if (error instanceof GoogleCalendarApiError) return error.message;
  if (error instanceof Error && error.message.startsWith("Missing ")) {
    return error.message;
  }
  return "Google Calendar synchronization failed";
}
