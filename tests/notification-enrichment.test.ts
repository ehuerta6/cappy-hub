import { describe, expect, it, vi } from "vitest";
import { withPeriodParam } from "@/lib/period-url";

vi.mock("server-only", () => ({}));

import { enrichOfficerNotifications } from "@/lib/notification-enrichment";

describe("withPeriodParam", () => {
  it("appends period when present and preserves existing query parameters", () => {
    expect(withPeriodParam("/points", null)).toBe("/points");
    expect(withPeriodParam("/points", "4")).toBe("/points?period=4");
    expect(withPeriodParam("/points?view=history", "4")).toBe(
      "/points?view=history&period=4",
    );
  });
});

describe("enrichOfficerNotifications", () => {
  it("prepends the officer name when missing and leaves notifications that already include it unchanged", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          in: async () => ({
            data: [{ id: 12, name: "Ada Lovelace" }],
            error: null,
          }),
        }),
      }),
    } as unknown as Parameters<typeof enrichOfficerNotifications>[0];

    const result = await enrichOfficerNotifications(supabase, [
      {
        entity_type: "officer",
        entity_id: 12,
        title: "Officer reached 3 active Warnings",
        message: "Review this Officer record.",
      },
      {
        entity_type: "officer",
        entity_id: 12,
        title: "Ada Lovelace reached 3 active Warnings",
        message: "Review this Officer record.",
      },
      {
        entity_type: "event",
        entity_id: 5,
        title: "Event updated",
        message: "Schedule changed.",
      },
    ]);

    expect(result[0]?.message).toBe(
      "Ada Lovelace — Review this Officer record.",
    );
    expect(result[1]?.message).toBe("Review this Officer record.");
    expect(result[2]?.message).toBe("Schedule changed.");
  });
});
