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
import { revalidatePath } from "next/cache";
import {
  addTransaction,
  changeParticipationRate,
  removeParticipationAward,
  searchEvents,
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
      positionCode: positionName === "Lead" ? "lead" : "officer",
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
  const transaction = form();
  transaction.set("event_id", "12");
  const result = await addTransaction({ error: "", success: "" }, transaction);
  expect(result.success).toBe("Point transaction added");
  expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  expect(rpc).toHaveBeenCalledWith("add_manual_transaction", {
    p_officer_id: 3,
    p_event_id: 12,
    p_points: 2,
    p_reason: "Correction",
    p_award_type: "correction",
  });
});

it("submits manual transactions without an Event relationship", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "admin",
  } as never);
  const transaction = form();
  transaction.set("award_type", "manual");
  transaction.set("event_id", "");
  const result = await addTransaction({ error: "", success: "" }, transaction);
  expect(result.success).toBe("Point transaction added");
  expect(rpc).toHaveBeenCalledWith("add_manual_transaction", {
    p_officer_id: 3,
    p_event_id: undefined,
    p_points: 2,
    p_reason: "Correction",
    p_award_type: "manual",
  });
});

it.each(["", "not-an-id"])(
  "rejects an empty or invalid Officer ID (%s) before the RPC",
  async (officerId) => {
    vi.mocked(getAuthorizationContext).mockResolvedValue({
      applicationRole: "admin",
    } as never);
    const transaction = form();
    transaction.set("officer_id", officerId);
    expect(
      await addTransaction({ error: "", success: "" }, transaction),
    ).toMatchObject({
      error: "Select an officer",
      fieldErrors: { officer_id: "Select an officer" },
      values: { officer_id: officerId },
    });
    expect(rpc).not.toHaveBeenCalled();
  },
);

it("returns persistence errors with submitted values for retry", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "admin",
  } as never);
  rpc.mockResolvedValueOnce({
    error: { message: "unexpected database failure" },
  });
  const transaction = form();
  transaction.set("event_id", "12");
  const result = await addTransaction({ error: "", success: "" }, transaction);
  expect(result).toMatchObject({
    error: "Could not save changes",
    success: "",
    values: {
      officer_id: "3",
      points: "2",
      reason: "Correction",
      award_type: "correction",
      event_id: "12",
    },
  });
});

it("loads Event dates for older Event search results", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "admin",
  } as never);
  const selectedColumns = vi.fn();
  const query = {
    select: (columns: string) => {
      selectedColumns(columns);
      return query;
    },
    is: () => query,
    ilike: () => query,
    order: () => query,
    limit: () => query,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [{ id: 12, name: "Repeated event", event_date: "2026-10-15" }],
        error: null,
      }).then(resolve),
  };
  vi.mocked(createClient).mockResolvedValue({
    from: () => query,
  } as never);

  await expect(searchEvents("Repeated")).resolves.toEqual([
    { id: 12, name: "Repeated event", event_date: "2026-10-15" },
  ]);
  expect(selectedColumns).toHaveBeenCalledWith("id,name,event_date");
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
    values: {
      points: "0",
      officer_id: "3",
      reason: "Correction",
      event_id: "",
      award_type: "correction",
    },
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects non-admin rate and removal actions before reaching Supabase", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "officer",
    positionName: "Lead",
    positionCode: "lead",
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
