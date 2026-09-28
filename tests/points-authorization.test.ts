import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
  canManagePoints: (actor: { applicationRole: string }) =>
    actor.applicationRole === "admin",
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { addTransaction } from "@/app/(protected)/points/actions";

const rpc = vi.fn().mockResolvedValue({ error: null });
const form = () => {
  const data = new FormData();
  data.set("officer_id", "3");
  data.set("points", "2");
  data.set("reason", "Correction");
  data.set("award_type", "correction");
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
});

it.each(["Officer", "Lead"])(
  "rejects %s at the application point path",
  async (positionName) => {
    vi.mocked(getAuthorizationContext).mockResolvedValue({
      applicationRole: "officer",
      positionName,
    } as never);
    const result = await addTransaction({ error: "", success: "" }, form());
    expect(result.error).toBe("Admin required");
    expect(rpc).not.toHaveBeenCalled();
  },
);

it("submits an admin correction with an authenticated client", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "admin",
  } as never);
  const result = await addTransaction({ error: "", success: "" }, form());
  expect(result.success).toBe("Transaction added");
  expect(rpc).toHaveBeenCalledWith("add_manual_transaction", {
    p_officer_id: 3,
    p_event_id: undefined,
    p_points: 2,
    p_reason: "Correction",
    p_award_type: "correction",
  });
});
