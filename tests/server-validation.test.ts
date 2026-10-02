import { expect, it } from "vitest";
import { saveEventInputSchema } from "@/app/(protected)/events/validation";
import { catalogMutationInputSchema } from "@/app/(protected)/catalog-validation";
import {
  editPointTransactionInputSchema,
  manualPointTransactionInputSchema,
  participationRateInputSchema,
  pointHistoryFiltersSchema,
  resolvePointHistoryStatus,
} from "@/app/(protected)/points/validation";
import {
  createTaskInputSchema,
  taskActionInputSchema,
} from "@/app/(protected)/tasks/validation";
import { safeIntegerStringSchema } from "@/lib/validation";

it("accepts safe integer strings and rejects blank, malformed, and unsafe IDs", () => {
  const identifierSchema = safeIntegerStringSchema("Invalid identifier");
  expect(identifierSchema.parse("-12")).toBe(-12);
  expect(identifierSchema.parse(" 12 ")).toBe(12);
  expect(identifierSchema.safeParse("").success).toBe(false);
  expect(identifierSchema.safeParse("12x").success).toBe(false);
  expect(identifierSchema.safeParse("9007199254740992").success).toBe(false);
});

it("validates Event shape and keeps Event range boundaries", () => {
  const validEvent = {
    id: "",
    name: " Club meeting ",
    description: "Agenda",
    event_type_id: "2",
    location: "Campus",
    event_date: "2026-10-12",
    start_time: "06:00",
    end_time: "23:59",
    branches: ["-4", "2"],
    slides_url: "",
    meeting_notes_url: "",
  };
  expect(saveEventInputSchema.safeParse(validEvent).success).toBe(true);
  expect(
    saveEventInputSchema.safeParse({ ...validEvent, event_date: "10/12/2026" })
      .success,
  ).toBe(false);
  expect(
    saveEventInputSchema.safeParse({ ...validEvent, start_time: "05:59" })
      .success,
  ).toBe(false);
  expect(
    saveEventInputSchema.safeParse({ ...validEvent, name: " " }).success,
  ).toBe(false);
});

it("validates Task fields and operation-specific assignment input", () => {
  const validTask = {
    title: "Flyer",
    description: "Prepare the event flyer",
    task_type: "Flyer",
    branch_id: "-5",
    due_date: "2026-10-15",
    points: "1.5",
    approval_required: "on",
  };
  expect(createTaskInputSchema.safeParse(validTask).success).toBe(true);
  expect(
    createTaskInputSchema.safeParse({ ...validTask, points: "Infinity" })
      .success,
  ).toBe(false);
  expect(
    taskActionInputSchema.safeParse({
      task_id: "1",
      operation: "assign",
      officer_id: "-2",
    }).success,
  ).toBe(true);
  expect(
    taskActionInputSchema.safeParse({
      task_id: "1",
      operation: "assign",
    }).success,
  ).toBe(false);
});

it("requires finite nonzero points and a positive participation rate", () => {
  const transaction = {
    points: "-1.25",
    award_type: "correction",
    reason: "Adjust historical total",
    officer_id: "3",
    event_id: "",
  };
  expect(manualPointTransactionInputSchema.safeParse(transaction).success).toBe(
    true,
  );
  expect(
    manualPointTransactionInputSchema.safeParse({ ...transaction, points: "0" })
      .success,
  ).toBe(false);
  expect(
    manualPointTransactionInputSchema.safeParse({
      ...transaction,
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

it("models only valid catalog operation combinations", () => {
  expect(
    catalogMutationInputSchema.safeParse({
      catalog: "branch",
      operation: "create",
      name: "Denver",
    }).success,
  ).toBe(true);
  expect(
    catalogMutationInputSchema.safeParse({
      catalog: "position",
      operation: "rename",
      id: "4",
      name: "Lead",
    }).success,
  ).toBe(true);
  expect(
    catalogMutationInputSchema.safeParse({
      catalog: "branch",
      operation: "delete",
      id: "4",
    }).success,
  ).toBe(true);
  expect(
    catalogMutationInputSchema.safeParse({
      catalog: "branch",
      operation: "rename",
      id: "",
      name: "Denver",
    }).success,
  ).toBe(false);
  expect(
    catalogMutationInputSchema.safeParse({
      catalog: "branch",
      operation: "create",
      id: "4",
      name: "",
    }).success,
  ).toBe(false);
});
