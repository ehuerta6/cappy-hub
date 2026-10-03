import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createTask, updateTask } from "@/app/(protected)/tasks/actions";

const rpc = vi.fn();
const taskForm = () => {
  const data = new FormData();
  data.set("title", " Flyer ");
  data.set("description", " Prepare the flyer ");
  data.set("task_type", "Flyer");
  data.set("branch_id", "-5");
  data.set("due_date", "2026-10-15");
  data.set("points", "1.5");
  data.set("approval_required", "on");
  data.set("recurrence_request_key", "00000000-0000-4000-8000-000000000002");
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthorizationContext).mockResolvedValue({ id: 8 } as never);
  vi.mocked(createClient).mockResolvedValue({ rpc } as never);
  rpc.mockResolvedValue({ data: 9, error: null });
});

it("rejects malformed task points before calling the RPC", async () => {
  const invalidTaskForm = taskForm();
  invalidTaskForm.set("points", "Infinity");
  const result = await createTask({ error: "" }, invalidTaskForm);
  expect(result).toEqual({ error: "Invalid task fields" });
  expect(rpc).not.toHaveBeenCalled();
});

it("submits task creation values to the existing RPC", async () => {
  await createTask({ error: "" }, taskForm());
  expect(rpc).toHaveBeenCalledWith("save_task", {
    p_title: " Flyer ",
    p_description: " Prepare the flyer ",
    p_task_type: "Flyer",
    p_branch_id: -5,
    p_due_date: "2026-10-15",
    p_points: 1.5,
    p_approval_required: true,
  });
  expect(revalidatePath).toHaveBeenCalledWith("/tasks");
});

it("creates separate recurring Task due-date rows", async () => {
  const recurring = taskForm();
  recurring.set("recurrence_frequency", "daily");
  recurring.set("recurrence_interval", "2");
  recurring.set("recurrence_end_mode", "count");
  recurring.set("recurrence_count", "3");
  await createTask({ error: "" }, recurring);
  expect(rpc).toHaveBeenCalledWith("create_recurring_task", {
    p_title: " Flyer ",
    p_description: " Prepare the flyer ",
    p_task_type: "Flyer",
    p_branch_id: -5,
    p_points: 1.5,
    p_approval_required: true,
    p_recurrence_rule: "RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3",
    p_request_key: "00000000-0000-4000-8000-000000000002",
    p_due_dates: ["2026-10-15", "2026-10-17", "2026-10-19"],
  });
});

it("requires an assigned officer only for the assign task action", async () => {
  const invalidAssignment = new FormData();
  invalidAssignment.set("task_id", "-9");
  invalidAssignment.set("operation", "assign");
  expect(
    await updateTask({ error: "", success: "" }, invalidAssignment),
  ).toEqual({ error: "Officer not found", success: "" });
  expect(rpc).not.toHaveBeenCalled();

  const completion = new FormData();
  completion.set("task_id", "-9");
  completion.set("operation", "complete");
  expect(await updateTask({ error: "", success: "" }, completion)).toEqual({
    error: "",
    success: "Task updated",
  });
  expect(rpc).toHaveBeenCalledWith("complete_task", { p_task_id: -9 });
});

it("preserves assignment and approval RPC arguments", async () => {
  const assignmentForm = new FormData();
  assignmentForm.set("task_id", "-9");
  assignmentForm.set("operation", "assign");
  assignmentForm.set("officer_id", "-10");
  expect(await updateTask({ error: "", success: "" }, assignmentForm)).toEqual({
    error: "",
    success: "Task updated",
  });
  expect(rpc).toHaveBeenCalledWith("assign_task", {
    p_task_id: -9,
    p_officer_id: -10,
  });
  expect(revalidatePath).toHaveBeenCalledWith("/tasks/-9");

  rpc.mockClear();
  const approvalForm = new FormData();
  approvalForm.set("task_id", "-9");
  approvalForm.set("operation", "approve");
  expect(await updateTask({ error: "", success: "" }, approvalForm)).toEqual({
    error: "",
    success: "Task updated",
  });
  expect(rpc).toHaveBeenCalledWith("approve_task", { p_task_id: -9 });
  expect(revalidatePath).toHaveBeenCalledWith("/tasks/-9");
});

it("returns a controlled message for an unknown task action", async () => {
  const invalidAction = new FormData();
  invalidAction.set("task_id", "1");
  invalidAction.set("operation", "unknown");
  expect(await updateTask({ error: "", success: "" }, invalidAction)).toEqual({
    error: "Unknown task action",
    success: "",
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("recurring Task editing submits only changed fields to its trusted RPC", async () => {
  const { editRecurringTask } = await import("@/app/(protected)/tasks/actions");
  const data = taskForm();
  data.set("task_id", "9");
  data.set("scope", "series");
  data.set("recurrence_series_id", "3");
  data.set("recurrence_revision", "2");
  data.set("mutation_request_key", "00000000-0000-4000-8000-000000000068");
  data.append("edited_fields", "title");
  await editRecurringTask({ error: "" }, data);
  expect(rpc).toHaveBeenCalledWith("mutate_recurring_task", {
    p_selected_id: 9,
    p_scope: "series",
    p_operation: "edit",
    p_series_id: 3,
    p_revision: 2,
    p_request_key: "00000000-0000-4000-8000-000000000068",
    p_patch: { title: " Flyer " },
  });
  expect(rpc).not.toHaveBeenCalledWith("save_task", expect.anything());
});
