import { afterEach, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    rest: {},
    rpc(this: { rest: object }, name: string, args: Record<string, unknown>) {
      if (!this.rest) throw new Error("Supabase RPC client context is missing");
      supabaseMock.rpcCalls.push({ name, args });
      return Promise.resolve({ data: [], error: null });
    },
  })),
}));

import { createGoogleCalendarSyncStore } from "../lib/google-calendar/store";

afterEach(() => {
  supabaseMock.rpcCalls = [];
  vi.unstubAllEnvs();
});

it("claims work through the initialized Supabase RPC client", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_SECRET_KEY", "local-test-secret");
  vi.stubEnv("GOOGLE_CALENDAR_ID", "sandbox-calendar@example.test");

  const store = createGoogleCalendarSyncStore();
  await store.claim(5);

  expect(supabaseMock.rpcCalls).toEqual([
    {
      name: "claim_event_google_calendar_sync_batch",
      args: {
        p_limit: 5,
        p_calendar_id: "sandbox-calendar@example.test",
      },
    },
  ]);
});
