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
