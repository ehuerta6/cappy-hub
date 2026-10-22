import { timingSafeEqual } from "node:crypto";
import { GoogleCalendarApi } from "@/lib/google-calendar-api";
import { googleCalendarAccessToken } from "@/lib/google-calendar-auth";
import {
  googleCalendarSyncError,
  syncGoogleCalendarJob,
} from "@/lib/google-calendar-sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorized(request, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const calendarId = required("GOOGLE_CALENDAR_ID");
    const appUrl = canonicalAppUrl(required("CAPPYHUB_APP_URL"));
    const accessToken = await googleCalendarAccessToken();
    const supabase = createAdminClient();
    const calendar = new GoogleCalendarApi(accessToken, calendarId);
    const { data: jobs, error: claimError } = await supabase.rpc(
      "claim_google_calendar_event_sync",
      { p_limit: 10 },
    );
    if (claimError)
      throw new Error("Could not claim Google Calendar sync work");

    let synced = 0;
    let retrying = 0;
    let superseded = 0;
    for (const job of jobs ?? []) {
      let failure: string | null = null;
      try {
        const { data: event, error } = await supabase
          .from("events")
          .select(
            "id,name,description,location,starts_at,ends_at,status,deleted_at",
          )
          .eq("id", job.event_id)
          .maybeSingle();
        if (error) throw new Error("Cappy Hub Event lookup failed");
        await syncGoogleCalendarJob(job, {
          loadEvent: async () => event,
          calendar,
          calendarAppUrl: appUrl,
        });
      } catch (error) {
        failure = googleCalendarSyncError(error);
      }

      const { data: completed, error: finishError } = await supabase.rpc(
        "finish_google_calendar_event_sync",
        {
          p_event_id: job.event_id,
          p_revision: job.revision,
          ...(failure ? { p_error: failure } : {}),
        },
      );
      if (finishError)
        throw new Error("Could not record Google Calendar sync result");
      if (failure) {
        retrying += 1;
        console.error("Google Calendar Event sync will retry", {
          eventId: job.event_id,
          reason: failure,
        });
      } else if (completed) {
        synced += 1;
      } else {
        superseded += 1;
      }
    }

    return Response.json({
      claimed: jobs?.length ?? 0,
      synced,
      retrying,
      superseded,
    });
  } catch (error) {
    const reason = googleCalendarSyncError(error);
    console.error("Google Calendar sync worker failed", { reason });
    return Response.json(
      { error: "Google Calendar sync is temporarily unavailable" },
      { status: 503 },
    );
  }
}

function authorized(request: Request, secret: string): boolean {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
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
