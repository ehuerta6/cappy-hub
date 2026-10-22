import { NextResponse, type NextRequest } from "next/server";
import { getCurrentOfficer } from "@/lib/current-officer";
import { createLocalGoogleCalendarApi } from "@/lib/google-calendar/auth";
import { processGoogleCalendarSyncBatch } from "@/lib/google-calendar/worker";
import { createGoogleCalendarSyncStore } from "@/lib/google-calendar/store";
import { GoogleCalendarApiError } from "@/lib/google-calendar/api";
import { validateLocalCalendarEnvironment } from "@/lib/google-calendar/projection";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const localMode = validateLocalCalendarEnvironment({
    mode: process.env.GOOGLE_CALENDAR_MODE,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    ci: process.env.CI,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    credentialEmail:
      "cappyhub-calendar-local@cappy-hub.iam.gserviceaccount.com",
  });
  if (!localMode.ok)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  try {
    if (!origin || !host || new URL(origin).host !== host)
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 },
      );
  } catch {
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  }

  const officer = await getCurrentOfficer();
  if (!officer)
    return NextResponse.json(
      { error: "Active Officer access required" },
      { status: 403 },
    );

  const appOrigin = process.env.CAPPY_HUB_APP_ORIGIN;
  if (!appOrigin)
    return NextResponse.json(
      { error: "Local app origin is not configured" },
      { status: 503 },
    );

  try {
    const calendar = await createLocalGoogleCalendarApi();
    const result = await processGoogleCalendarSyncBatch({
      store: createGoogleCalendarSyncStore(),
      calendar,
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      appOrigin,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // Do not expose credentials, API response bodies, or Supabase details.
    let code = "worker_failed";
    if (error instanceof GoogleCalendarApiError) {
      const reason = error.reason.toLowerCase();
      code = /^[a-z0-9_.-]{1,80}$/.test(reason)
        ? `google_${error.status}_${reason}`
        : `google_${error.status}_error`;
    } else if (
      error instanceof Error &&
      error.message.includes("iam.serviceAccounts.getAccessToken")
    ) {
      code = "impersonation_permission_denied";
    }
    return NextResponse.json(
      { error: "Calendar sync could not run", code },
      { status: 503 },
    );
  }
}
