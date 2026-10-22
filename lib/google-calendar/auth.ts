import "server-only";
import { GoogleAuth, Impersonated } from "google-auth-library";
import { GoogleCalendarApi } from "./api";
import { validateLocalCalendarEnvironment } from "./projection";

const TEST_SERVICE_ACCOUNT =
  "cappyhub-calendar-local@cappy-hub.iam.gserviceaccount.com";

export async function createLocalGoogleCalendarApi() {
  const auth = new GoogleAuth({
    scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.calendars.readonly",
    ],
  });
  const client = await auth.getClient();
  if (!(client instanceof Impersonated))
    throw new Error(
      "Local Calendar requires short-lived Service Account impersonation",
    );
  const identity = await auth.getCredentials();
  const config = {
    mode: process.env.GOOGLE_CALENDAR_MODE,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    ci: process.env.CI,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    credentialEmail: identity.client_email,
  };
  const valid = validateLocalCalendarEnvironment(config);
  if (!valid.ok) throw new Error(valid.reason);
  if (client.getTargetPrincipal() !== TEST_SERVICE_ACCOUNT)
    throw new Error("ADC target is not the authorized testing Service Account");

  return new GoogleCalendarApi({
    calendarId: process.env.GOOGLE_CALENDAR_ID!,
    getAccessToken: async () => {
      const token = await client.getAccessToken();
      if (!token.token)
        throw new Error("Could not obtain an impersonated access token");
      return token.token;
    },
  });
}
