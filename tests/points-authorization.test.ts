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
import {
  addTransaction,
  changeParticipationRate,
  removeParticipationAward,
} from "@/app/(protected)/points/actions";

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
  expect(result.success).toBe("Point transaction added");
  expect(rpc).toHaveBeenCalledWith("add_manual_transaction", {
    p_officer_id: 3,
    p_event_id: undefined,
    p_points: 2,
    p_reason: "Correction",
    p_award_type: "correction",
  });
});

it("rejects zero point changes before the admin correction RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "admin",
  } as never);
  const zeroPointForm = form();
  zeroPointForm.set("points", "0");
  expect(
    await addTransaction({ error: "", success: "" }, zeroPointForm),
  ).toMatchObject({
    error: "Enter a nonzero positive or negative point value",
    fieldErrors: {
      points: "Enter a nonzero positive or negative point value",
    },
    values: { points: "0" },
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects non-admin rate and removal actions before reaching Supabase", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "officer",
    positionName: "Lead",
  } as never);
  const rate = new FormData();
  rate.set("rate", "1.5");
  const removal = new FormData();
  removal.set("transaction_id", "5");
  expect(
    (await changeParticipationRate({ error: "", success: "" }, rate)).error,
  ).toBe("Admin required");
  expect(
    (await removeParticipationAward({ error: "", success: "" }, removal)).error,
  ).toBe("Admin required");
  expect(rpc).not.toHaveBeenCalled();
});

it("sends a valid fractional rate to the protected RPC", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "admin",
  } as never);
  const rate = new FormData();
  rate.set("rate", "1.25");
  expect(
    (await changeParticipationRate({ error: "", success: "" }, rate)).success,
  ).toBe("Participation rate saved");
  expect(rpc).toHaveBeenCalledWith("set_participation_rate", { p_rate: 1.25 });
});

it("uses the protected removal RPC and surfaces an already-removed result", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "admin",
  } as never);
  rpc.mockResolvedValueOnce({ data: false, error: null });
  const removal = new FormData();
  removal.set("transaction_id", "5");
  expect(
    (await removeParticipationAward({ error: "", success: "" }, removal))
      .success,
  ).toBe("Award was already removed");
  expect(rpc).toHaveBeenCalledWith("remove_participation_award", {
    p_transaction_id: 5,
  });
});
