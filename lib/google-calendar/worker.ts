import {
  buildCalendarProjection,
  type GoogleEventProjection,
  googleEventIdForOccurrence,
} from "./projection";

export type CalendarSyncClaim = {
  event_id: number;
  generation: number;
  lease_token: string;
  event_name: string;
  starts_at: string;
  ends_at: string;
  event_status: string;
  archived_at: string | null;
  was_remote_visible: boolean;
  google_event_id: string | null;
  google_etag: string | null;
  google_html_link: string | null;
};

export type CalendarSyncStore = {
  claim: (limit: number) => Promise<CalendarSyncClaim[]>;
  complete: (input: {
    eventId: number;
    generation: number;
    leaseToken: string;
    state: "synced" | "removed";
    googleEventId: string;
    etag: string | null;
    htmlLink: string | null;
  }) => Promise<boolean>;
  retry: (input: {
    eventId: number;
    leaseToken: string;
    errorCode: string;
  }) => Promise<boolean>;
};

export type CalendarSyncApi = {
  verifyCalendar: () => Promise<void>;
  upsert: (
    event: GoogleEventProjection,
    previousEtag: string | null,
  ) => Promise<
    | { status: "synced"; etag: string | null; htmlLink: string | null }
    | { status: "superseded" }
  >;
  delete: (
    eventId: string,
    cappyHubEventId: string,
  ) => Promise<{ status: "removed" }>;
};

export async function processGoogleCalendarSyncBatch(input: {
  store: CalendarSyncStore;
  calendar: CalendarSyncApi;
  calendarId: string;
  appOrigin: string;
  now?: Date;
  limit?: number;
}) {
  await input.calendar.verifyCalendar();
  const rows = await input.store.claim(input.limit ?? 20);
  let synced = 0;
  let removed = 0;
  let failed = 0;

  for (const row of rows) {
    const queueIdentity = {
      eventId: row.event_id,
      generation: row.generation,
      leaseToken: row.lease_token,
    };
    const currentEvent = {
      id: row.event_id,
      name: row.event_name,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      status: row.event_status,
      deleted_at: row.archived_at,
    };
    try {
      const projection = buildCalendarProjection(currentEvent, {
        appOrigin: input.appOrigin,
        now: input.now ?? new Date(),
        wasRemoteVisible: row.was_remote_visible,
        generation: row.generation,
      });

      if (projection.action === "skip") {
        const done = await input.store.complete({
          ...queueIdentity,
          state: "removed",
          googleEventId:
            row.google_event_id ?? googleEventIdForOccurrence(row.event_id),
          etag: row.google_etag,
          htmlLink: row.google_html_link,
        });
        if (done) removed += 1;
        continue;
      }

      if (projection.action === "delete") {
        await input.calendar.delete(projection.eventId, String(row.event_id));
        const done = await input.store.complete({
          ...queueIdentity,
          state: "removed",
          googleEventId: projection.eventId,
          etag: null,
          htmlLink: row.google_html_link,
        });
        if (done) removed += 1;
        continue;
      }

      const result = await input.calendar.upsert(
        projection.body,
        row.google_etag,
      );
      if (result.status === "superseded") {
        await input.store.retry({
          ...queueIdentity,
          errorCode: "remote_generation_newer",
        });
        failed += 1;
        continue;
      }
      const done = await input.store.complete({
        ...queueIdentity,
        state: "synced",
        googleEventId: projection.body.id,
        etag: result.etag,
        htmlLink: result.htmlLink,
      });
      if (done) synced += 1;
    } catch (error) {
      const errorCode =
        error instanceof Error &&
        "reason" in error &&
        typeof error.reason === "string"
          ? error.reason
          : "worker_error";
      await input.store.retry({ ...queueIdentity, errorCode });
      failed += 1;
    }
  }

  return { claimed: rows.length, synced, removed, failed };
}
