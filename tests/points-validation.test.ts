import { expect, it } from "vitest";
import {
  editPointTransactionInputSchema,
  manualPointTransactionInputSchema,
  participationRateInputSchema,
  pointHistoryFiltersSchema,
  resolvePointHistoryStatus,
} from "@/app/(protected)/points/validation";

it("requires finite nonzero points and a positive participation rate", () => {
  const manualPointTransaction = {
    points: "-1.25",
    award_type: "correction",
    reason: "Adjust historical total",
    officer_id: "3",
    event_id: "",
  };
  expect(
    manualPointTransactionInputSchema.safeParse(manualPointTransaction).success,
  ).toBe(true);
  expect(
    manualPointTransactionInputSchema.safeParse({
      ...manualPointTransaction,
      points: "0",
    }).success,
  ).toBe(false);
  expect(
    manualPointTransactionInputSchema.safeParse({
      ...manualPointTransaction,
      points: "NaN",
    }).success,
  ).toBe(false);
  expect(participationRateInputSchema.safeParse({ rate: "0.25" }).success).toBe(
    true,
  );
  expect(participationRateInputSchema.safeParse({ rate: "0" }).success).toBe(
    false,
  );
  expect(
    editPointTransactionInputSchema.safeParse({
      transaction_id: "4",
      points: "Infinity",
    }).success,
  ).toBe(false);
});

it("validates Point History filters, dates, signed local IDs, and page fallback", () => {
  const validatedPointHistoryFilters = pointHistoryFiltersSchema.parse({
    q: " Emi ",
    type: "participation",
    officer: "-1013",
    event: "-2001",
    status: "removed",
    from: "2026-09-01",
    to: "2026-10-01",
    page: "8",
  });
  expect(validatedPointHistoryFilters).toMatchObject({
    q: "Emi",
    type: "participation",
    officer: -1013,
    event: -2001,
    status: "removed",
    from: "2026-09-01",
    to: "2026-10-01",
    page: 8,
    dateRangeIsReversed: false,
  });

  expect(pointHistoryFiltersSchema.parse({ from: "2026-09-01" }).from).toBe(
    "2026-09-01",
  );
  expect(pointHistoryFiltersSchema.parse({ to: "2026-10-01" }).to).toBe(
    "2026-10-01",
  );

  const malformedPointHistoryFilters = pointHistoryFiltersSchema.parse({
    from: "2026-02-30",
    to: "yesterday",
    type: "not-a-type",
    officer: "9007199254740992",
    event: "bad-id",
    page: "-2",
  });
  expect(malformedPointHistoryFilters).toMatchObject({
    from: undefined,
    to: undefined,
    type: undefined,
    officer: undefined,
    event: undefined,
    page: 1,
  });

  expect(
    pointHistoryFiltersSchema.parse({
      from: "2026-10-02",
      to: "2026-10-01",
    }).dateRangeIsReversed,
  ).toBe(true);
});

it("keeps removed/all Point History status available only to admins", () => {
  expect(resolvePointHistoryStatus("removed", false)).toBe("active");
  expect(resolvePointHistoryStatus("all", false)).toBe("active");
  expect(resolvePointHistoryStatus("removed", true)).toBe("removed");
  expect(resolvePointHistoryStatus(undefined, true)).toBe("active");
});
