import { createHash } from "node:crypto";

export type CalendarEventSource = {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  deleted_at: string | null;
};

export type GoogleEventProjection = {
  id: string;
  status: "confirmed";
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: "America/Denver" };
  end: { dateTime: string; timeZone: "America/Denver" };
  visibility: "default";
  transparency: "opaque" | "transparent";
  extendedProperties: {
    private: { cappyHubEventId: string; cappyHubGeneration: string };
  };
};

export type CalendarProjectionResult =
  | { action: "upsert"; body: GoogleEventProjection }
  | { action: "delete"; eventId: string }
  | { action: "skip" };

const TEST_SERVICE_ACCOUNT =
  "cappyhub-calendar-local@cappy-hub.iam.gserviceaccount.com";
const GOOGLE_EVENT_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuv";

export function googleEventIdForOccurrence(eventId: number): string {
  if (!Number.isSafeInteger(eventId))
    throw new TypeError("Invalid Cappy Hub Event ID");

  const digest = createHash("sha256").update(String(eventId)).digest();
  let output = "ch";
  let buffer = 0;
  let bits = 0;
  for (const byte of digest) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += GOOGLE_EVENT_ID_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) output += GOOGLE_EVENT_ID_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

export function buildCalendarProjection(
  event: CalendarEventSource,
  options: {
    appOrigin: string;
    now: Date;
    wasRemoteVisible: boolean;
    generation: number;
  },
): CalendarProjectionResult {
  const eventId = googleEventIdForOccurrence(event.id);
  if (event.deleted_at)
    // Always reconcile the deterministic ID: an earlier insert may have
    // succeeded remotely while its stale database completion was rejected.
    return { action: "delete", eventId };

  const endsAt = Date.parse(event.ends_at);
  if (!Number.isFinite(endsAt)) throw new TypeError("Invalid Event end time");
  if (endsAt < options.now.getTime() && !options.wasRemoteVisible)
    return { action: "skip" };

  const origin = new URL(options.appOrigin);
  if (
    origin.origin !== options.appOrigin ||
    (origin.protocol !== "https:" && origin.hostname !== "localhost")
  )
    throw new TypeError("Cappy Hub origin must be a canonical HTTPS origin");

  const cancelled = event.status === "cancelled";
  const eventUrl = new URL(`/events/${event.id}`, origin).toString();
  return {
    action: "upsert",
    body: {
      id: eventId,
      status: "confirmed",
      summary: cancelled ? `[CANCELLED] ${event.name}` : event.name,
      description: `Open this Event in Cappy Hub:\n${eventUrl}`,
      start: {
        dateTime: new Date(event.starts_at).toISOString(),
        timeZone: "America/Denver",
      },
      end: {
        dateTime: new Date(event.ends_at).toISOString(),
        timeZone: "America/Denver",
      },
      // Visibility inherits from the private calendar ACL. Event-level
      // "private" can hide details from authorized non-attendee Officers.
      visibility: "default",
      transparency: cancelled ? "transparent" : "opaque",
      extendedProperties: {
        private: {
          cappyHubEventId: String(event.id),
          cappyHubGeneration: String(options.generation),
        },
      },
    },
  };
}

export function validateLocalCalendarEnvironment(config: {
  mode?: string;
  nodeEnv?: string;
  vercelEnv?: string;
  ci?: string;
  supabaseUrl?: string;
  calendarId?: string;
  credentialEmail?: string;
}): { ok: true } | { ok: false; reason: string } {
  if (config.mode !== "local-test")
    return { ok: false, reason: "Local Google Calendar mode is not enabled" };
  if (config.nodeEnv !== "development" || config.vercelEnv)
    return { ok: false, reason: "Live Google Calendar access is local only" };
  if (config.ci === "true")
    return {
      ok: false,
      reason: "Live Google Calendar access is disabled in CI",
    };
  let localSupabase = false;
  try {
    const supabase = new URL(config.supabaseUrl ?? "");
    localSupabase =
      supabase.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(supabase.hostname) &&
      supabase.port === "54321";
  } catch {
    localSupabase = false;
  }
  if (!localSupabase)
    return {
      ok: false,
      reason: "Supabase must point to the local synthetic database",
    };
  if (!config.calendarId || config.calendarId === "primary")
    return { ok: false, reason: "An explicit testing Calendar ID is required" };
  if (config.credentialEmail !== TEST_SERVICE_ACCOUNT)
    return {
      ok: false,
      reason: "Google credentials must be the testing Service Account",
    };
  return { ok: true };
}
