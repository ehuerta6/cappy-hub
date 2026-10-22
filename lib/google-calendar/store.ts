import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { CalendarSyncClaim, CalendarSyncStore } from "./worker";

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

export function createGoogleCalendarSyncStore(): CalendarSyncStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error("Local server-side Supabase secret is not configured");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rpc = client.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult>;
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;

  return {
    async claim(limit) {
      const { data, error } = await rpc(
        "claim_event_google_calendar_sync_batch",
        {
          p_limit: limit,
          p_calendar_id: calendarId,
        },
      );
      if (error)
        throw new Error(`Could not claim Calendar work: ${error.message}`);
      return (data ?? []) as CalendarSyncClaim[];
    },
    async complete(input) {
      const { data, error } = await rpc("complete_event_google_calendar_sync", {
        p_event_id: input.eventId,
        p_calendar_id: calendarId,
        p_generation: input.generation,
        p_lease_token: input.leaseToken,
        p_sync_state: input.state,
        p_google_event_id: input.googleEventId,
        p_google_etag: input.etag,
        p_google_html_link: input.htmlLink,
      });
      if (error) throw new Error("Could not complete Calendar work");
      return data === true;
    },
    async retry(input) {
      const { data, error } = await rpc("retry_event_google_calendar_sync", {
        p_event_id: input.eventId,
        p_calendar_id: calendarId,
        p_lease_token: input.leaseToken,
        p_error_code: input.errorCode,
      });
      if (error) throw new Error("Could not schedule Calendar retry");
      return data === true;
    },
  };
}
