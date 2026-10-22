import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { GoogleAuth } from "google-auth-library";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eventStatus } from "@/lib/event-status";
import {
  buildGoogleCalendarEvent,
  googleCalendarEventId,
} from "@/lib/google-calendar-event";
import { googleCalendarAccessToken } from "@/lib/google-calendar-auth";
import { syncGoogleCalendarEvents } from "@/lib/google-calendar-sync";

const calendarReadScope = "https://www.googleapis.com/auth/calendar.readonly";
const eventFields =
  "id,name,description,location,event_date,starts_at,ends_at,status,deleted_at";
const enabled =
  process.env.CAPPYHUB_GOOGLE_CALENDAR_PUBLISH_TEST_EVENTS === "true" &&
  process.env.CAPPYHUB_GOOGLE_CALENDAR_TEST_OPT_IN === "true" &&
  process.env.CI !== "true" &&
  process.env.VERCEL !== "1" &&
  process.env.NODE_ENV !== "production";
const explicitlyRequested =
  process.env.npm_lifecycle_event === "calendar:publish-test";

if (explicitlyRequested && !enabled) {
  throw new Error(
    "Real calendar writes require both CAPPYHUB_GOOGLE_CALENDAR_TEST_OPT_IN=true and CAPPYHUB_GOOGLE_CALENDAR_PUBLISH_TEST_EVENTS=true, outside CI, Vercel, and production.",
  );
}

describe.skipIf(!enabled)("CAPPYHUB TEST Calendar publication", () => {
  it("publishes eligible local synthetic Events idempotently and verifies Google read-back", async () => {
    const calendarId = required("GOOGLE_CALENDAR_ID");
    const testCalendarId = required("CAPPYHUB_TEST_CALENDAR_ID");
    if (calendarId !== testCalendarId)
      throw new Error(
        "GOOGLE_CALENDAR_ID must match CAPPYHUB_TEST_CALENDAR_ID",
      );
    const appUrl = required("CAPPYHUB_APP_URL");
    const parsedAppUrl = new URL(appUrl);
    if (
      !["localhost", "127.0.0.1"].includes(parsedAppUrl.hostname) ||
      parsedAppUrl.protocol !== "http:" ||
      parsedAppUrl.pathname !== "/" ||
      parsedAppUrl.search ||
      parsedAppUrl.hash
    ) {
      throw new Error("CAPPYHUB_APP_URL must be a local HTTP origin");
    }

    const local = localSupabaseCredentials();
    const supabase = createClient(local.apiUrl, local.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from("events")
      .select(eventFields)
      .like("name", "Mock:%")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .gt("ends_at", new Date().toISOString());
    if (error)
      throw new Error(
        `Could not read local synthetic Events: ${error.message}`,
      );
    const now = Date.now();
    const events = (data ?? []).filter((event) => {
      const status = eventStatus(event, now);
      return status === "upcoming" || status === "happening";
    });
    if (!events.length)
      throw new Error(
        "No eligible synthetic Events found. Run `npm run local:reset` first.",
      );
    const eventIds = events.map((event) => event.id);
    expect(
      events.filter((event) => event.name === "Mock: Weekly Coding Workshop"),
    ).toHaveLength(2);

    const readAuth = new GoogleAuth({ scopes: [calendarReadScope] });
    const readClient = await readAuth.getClient();
    const { token: readToken } = await readClient.getAccessToken();
    if (!readToken) throw new Error("Google ADC returned no read token");
    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`,
      { headers: { Authorization: `Bearer ${readToken}` } },
    );
    if (!calendarResponse.ok)
      throw new Error(
        `Could not verify test calendar (HTTP ${calendarResponse.status})`,
      );
    const calendar = (await calendarResponse.json()) as {
      summary?: string;
      accessRole?: string;
    };
    if (calendar.summary !== "CAPPYHUB TEST")
      throw new Error("Configured Google calendar is not named CAPPYHUB TEST");
    if (calendar.accessRole !== "writer" && calendar.accessRole !== "owner")
      throw new Error(
        "Impersonated ADC identity does not have calendar write access",
      );

    const eventAccessToken = await googleCalendarAccessToken(calendarId);
    expect(await syncGoogleCalendarEvents(eventIds, supabase)).toBe(true);
    await verifyReadBack(events, calendarId, appUrl, eventAccessToken);

    // A second publication must update the same deterministic IDs.
    expect(await syncGoogleCalendarEvents(eventIds, supabase)).toBe(true);
    await verifyReadBack(events, calendarId, appUrl, eventAccessToken);
    console.info(
      `Published and verified ${events.length} eligible synthetic Event occurrences in CAPPYHUB TEST.`,
    );
  });

  async function verifyReadBack(
    events: Array<{
      id: number;
      name: string;
      description: string;
      location: string | null;
      starts_at: string;
      ends_at: string;
      status: string;
      deleted_at: string | null;
    }>,
    calendarId: string,
    appUrl: string,
    eventAccessToken: string,
  ) {
    for (const event of events) {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${googleCalendarEventId(event.id)}`,
        { headers: { Authorization: `Bearer ${eventAccessToken}` } },
      );
      if (!response.ok)
        throw new Error(
          `Google read-back failed for synthetic Event ${event.id} (HTTP ${response.status})`,
        );
      const actual = (await response.json()) as {
        id: string;
        summary: string;
        description?: string;
        location?: string;
        start: { dateTime: string; timeZone: string };
        end: { dateTime: string; timeZone: string };
        transparency: string;
        attendees?: unknown[];
      };
      const expected = buildGoogleCalendarEvent(event, appUrl);
      expect(actual.id).toBe(expected.id);
      expect(actual.summary).toBe(expected.summary);
      expect(actual.description).toBe(expected.description);
      expect(actual.location ?? "").toBe(expected.location ?? "");
      expect(Date.parse(actual.start.dateTime)).toBe(
        Date.parse(expected.start.dateTime),
      );
      expect(actual.start.timeZone).toBe("America/Denver");
      expect(Date.parse(actual.end.dateTime)).toBe(
        Date.parse(expected.end.dateTime),
      );
      expect(actual.end.timeZone).toBe("America/Denver");
      expect(actual.transparency).toBe(expected.transparency);
      expect(actual.attendees).toBeUndefined();
    }
  }
});

function localSupabaseCredentials() {
  const result = spawnSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0)
    throw new Error("Could not read local Supabase status from CLI");
  const output = result.stdout ?? "";
  const values = Object.fromEntries(
    output.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(?:"(.*)"|(.*))$/);
      return match ? [[match[1], match[2] ?? match[3] ?? ""]] : [];
    }),
  );
  const apiUrl = values.API_URL;
  const serviceRoleKey = values.SERVICE_ROLE_KEY ?? values.SECRET_KEY;
  if (!apiUrl || !serviceRoleKey)
    throw new Error(
      "Could not read local Supabase credentials from CLI status",
    );
  const url = new URL(apiUrl);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "54321"
  ) {
    throw new Error(
      "Publication requires the local Supabase API at port 54321",
    );
  }
  return { apiUrl, serviceRoleKey };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required local setting ${name}`);
  return value;
}
