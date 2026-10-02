import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { bulkAddEventOfficers } from "@/app/(protected)/events/actions";

const rpc = vi.fn();
const form = (...ids: string[]) => {
  const data = new FormData();
  data.set("event_id", "12");
  for (const id of ids) data.append("officer_ids", id);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthorizationContext).mockResolvedValue({ id: 8 } as never);
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
  rpc.mockResolvedValue({
    data: {
      added_officer_ids: [3, 4],
      awarded_officer_ids: [3, 4],
      points_per_officer: 5,
    },
    error: null,
  });
});

it("submits a selected officer group to the trusted RPC", async () => {
  const result = await bulkAddEventOfficers(
    { error: "", success: "" },
    form("3", "4", "3"),
  );
  expect(result.error).toBe("");
  expect(result.success).toContain("awarded 2 officers 5 points each");
  expect(rpc).toHaveBeenCalledWith("bulk_add_event_officers", {
    p_event_id: 12,
    p_officer_ids: [3, 4, 3],
  });
});

it("rejects malformed IDs before calling Supabase", async () => {
  const result = await bulkAddEventOfficers(
    { error: "", success: "" },
    form("3x"),
  );
  expect(result.error).toBe("Select valid officers");
  expect(rpc).not.toHaveBeenCalled();
});

it("surfaces trusted database authorization and validation errors", async () => {
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "Event outside branch scope" },
  });
  const result = await bulkAddEventOfficers(
    { error: "", success: "" },
    form("3"),
  );
  expect(result.error).toBe("Event outside branch scope");
});
