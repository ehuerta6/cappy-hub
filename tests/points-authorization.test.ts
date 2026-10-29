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
  searchPointHistoryEvents,
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
  const archivedFilter = vi.fn();
  const limit = vi.fn();
  const query = {
    select: (columns: string) => {
      selectedColumns(columns);
      return query;
    },
    is: (...args: unknown[]) => {
      archivedFilter(...args);
      return query;
    },
    ilike: () => query,
    order: () => query,
    limit: (count: number) => {
      limit(count);
      return query;
    },
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [{ id: 12, name: "Repeated event", event_date: "2026-10-15" }],
        error: null,
      }).then(resolve),
  };
  vi.mocked(createClient).mockResolvedValue({
    from: () => query,
  } as never);

  await expect(searchEvents("Repeated")).resolves.toEqual({
    events: [{ id: 12, name: "Repeated event", event_date: "2026-10-15" }],
    error: false,
  });
  expect(selectedColumns).toHaveBeenCalledWith("id,name,event_date");
  expect(archivedFilter).toHaveBeenCalledWith("deleted_at", null);
  expect(limit).toHaveBeenCalledWith(20);
});

it.each(["Officer", "Lead"])(
  "denies %s direct access to Event lookup",
  async (positionName) => {
    vi.mocked(getAuthorizationContext).mockResolvedValue({
      applicationRole: "officer",
      positionName,
      positionCode: positionName === "Lead" ? "lead" : "officer",
    } as never);

    await expect(searchEvents("Repeated")).resolves.toEqual({
      events: [],
      error: true,
    });
    expect(createClient).not.toHaveBeenCalled();
  },
);

it("distinguishes no matching Events from genuine lookup failures", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "admin",
  } as never);
  const makeQuery = (result: unknown) => {
    const query = {
      select: () => query,
      is: () => query,
      ilike: () => query,
      order: () => query,
      limit: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  };
  vi.mocked(createClient).mockResolvedValueOnce({
    from: () => makeQuery({ data: [], error: null }),
  } as never);
  vi.mocked(createClient).mockResolvedValueOnce({
    from: () => makeQuery({ data: null, error: { message: "private detail" } }),
  } as never);

  await expect(searchEvents("No match")).resolves.toEqual({
    events: [],
    error: false,
  });
  await expect(searchEvents("Request failure")).resolves.toEqual({
    events: [],
    error: true,
  });
});

it("bounds Point History Event search to twenty rows and keeps historical Events eligible", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "officer",
  } as never);
  const calls: unknown[][] = [];
  const historicalEvents = Array.from({ length: 500 }, (_, index) => ({
    id: index + 1,
    name:
      index === 0
        ? "Archived Workshop"
        : index === 1
          ? "Cancelled Workshop"
          : `Workshop ${index + 1}`,
    event_date: `2025-01-${String(index + 1).padStart(2, "0")}`,
  }));
  let limitValue = 0;
  const query = {
    select: (columns: string) => {
      calls.push(["select", columns]);
      return query;
    },
    ilike: (...args: unknown[]) => {
      calls.push(["ilike", ...args]);
      return query;
    },
    order: (...args: unknown[]) => {
      calls.push(["order", ...args]);
      return query;
    },
    limit: (count: number) => {
      calls.push(["limit", count]);
      limitValue = count;
      return query;
    },
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: historicalEvents.slice(0, limitValue),
        error: null,
      }).then(resolve),
  };
  vi.mocked(createClient).mockResolvedValue({
    from: (table: string) => {
      calls.push(["from", table]);
      return query;
    },
  } as never);

  await expect(searchPointHistoryEvents("Workshop")).resolves.toEqual({
    events: historicalEvents.slice(0, 20),
    error: false,
  });
  expect(calls).toContainEqual(["limit", 20]);
  expect(calls).toContainEqual(["select", "id,name,event_date"]);
  expect(calls).toContainEqual(["ilike", "name", "%Workshop%"]);
  expect(calls.some((call) => call[0] === "is" || call[0] === "eq")).toBe(
    false,
  );
});

it("returns a distinct failure result when Point History Event search errors", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    applicationRole: "officer",
  } as never);
  const query = {
    select: () => query,
    ilike: () => query,
    order: () => query,
    limit: () => query,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: null,
        error: { message: "private detail" },
      }).then(resolve),
  };
  vi.mocked(createClient).mockResolvedValue({ from: () => query } as never);
  await expect(searchPointHistoryEvents("Request failure")).resolves.toEqual({
    events: [],
    error: true,
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

it.each(["3", "-1"])(
  "submits independent signed manual credit (%s) with Event context",
  async (points) => {
    vi.mocked(getAuthorizationContext).mockResolvedValue({
      applicationRole: "admin",
    } as never);
    const transaction = form();
    transaction.set("award_type", "manual");
    transaction.set("event_id", "12");
    transaction.set("points", points);
    transaction.set("reason", "  Independent contribution  ");
    expect(
      await addTransaction({ error: "", success: "" }, transaction),
    ).toMatchObject({ success: "Point transaction added" });
    expect(rpc).toHaveBeenCalledWith("add_manual_transaction", {
      p_officer_id: 3,
      p_event_id: 12,
      p_points: Number(points),
      p_reason: "Independent contribution",
      p_award_type: "manual",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  },
);

it.each(["", "   ", "\t\n"])(
  "rejects a blank manual reason (%j) before persistence",
  async (reason) => {
    vi.mocked(getAuthorizationContext).mockResolvedValue({
      applicationRole: "admin",
    } as never);
    const transaction = form();
    transaction.set("award_type", "manual");
    transaction.set("reason", reason);
    expect(
      await addTransaction({ error: "", success: "" }, transaction),
    ).toMatchObject({ fieldErrors: { reason: "Enter a reason" } });
    expect(rpc).not.toHaveBeenCalled();
  },
);
