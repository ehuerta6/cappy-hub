import { afterEach, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ scopes: [] as string[] }));

vi.mock("server-only", () => ({}));
vi.mock("google-auth-library", () => {
  class Impersonated {
    getTargetPrincipal() {
      return "cappyhub-calendar-local@cappy-hub.iam.gserviceaccount.com";
    }

    async getAccessToken() {
      return { token: "test-token" };
    }
  }

  class GoogleAuth {
    constructor(options: { scopes: string[] }) {
      authMocks.scopes = options.scopes;
    }

    async getClient() {
      return new Impersonated();
    }

    async getCredentials() {
      return {
        client_email:
          "cappyhub-calendar-local@cappy-hub.iam.gserviceaccount.com",
      };
    }
  }

  return { GoogleAuth, Impersonated };
});

import { createLocalGoogleCalendarApi } from "../lib/google-calendar/auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("requests the narrow metadata-read scope required by calendar verification", async () => {
  vi.stubEnv("GOOGLE_CALENDAR_MODE", "local-test");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("CI", "false");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("GOOGLE_CALENDAR_ID", "sandbox-calendar@example.test");

  await createLocalGoogleCalendarApi();

  expect(authMocks.scopes).toContain(
    "https://www.googleapis.com/auth/calendar.events",
  );
  expect(authMocks.scopes).toContain(
    "https://www.googleapis.com/auth/calendar.calendars.readonly",
  );
});
