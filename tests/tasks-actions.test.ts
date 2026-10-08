import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  bulkAssignTaskOfficers,
  createTask,
  editStandaloneTask,
  removeTask,
  restoreTask,
  removeTaskAssignment,
  selfAssignTask,
  setTaskAssignmentCompletion,
} from "@/app/(protected)/tasks/actions";

const rpc = vi.fn();
const taskForm = () => {
  const data = new FormData();
  data.set("title", " Flyer ");
  data.set("description", " Prepare the flyer ");
  data.set("task_type", "Flyer");
  data.set("branch_id", "-5");
  data.set("due_date", "2026-10-15");
  data.set("points", "1.5");
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
  const result = await createTask({ error: "", success: "" }, invalidTaskForm);
  expect(result).toMatchObject({
    error: "Enter a positive point value",
    fieldErrors: { points: "Enter a positive point value" },
    values: { points: "Infinity" },
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("submits task creation values and optional Event links to the trusted RPC", async () => {
  await createTask({ error: "", success: "" }, taskForm());
  expect(rpc).toHaveBeenCalledWith("save_task_with_events", {
    p_title: " Flyer ",
    p_description: " Prepare the flyer ",
    p_task_type: "Flyer",
    p_branch_id: -5,
    p_due_date: "2026-10-15",
    p_points: 1.5,
    p_approval_required: false,
    p_event_ids: [],
  });
  expect(revalidatePath).toHaveBeenCalledWith("/tasks");
  expect(redirect).toHaveBeenCalledWith("/tasks?feedback=task-created#task-9");
});

it("validates and submits multiple Event links through the atomic Task mutation", async () => {
  const form = taskForm();
  form.append("event_ids", "21");
  form.append("event_ids", "22");
  await createTask({ error: "", success: "" }, form);
  expect(rpc).toHaveBeenCalledWith(
    "save_task_with_events",
    expect.objectContaining({ p_event_ids: [21, 22] }),
  );
});

it("rejects duplicate linked Event IDs before calling the Task mutation", async () => {
  const form = taskForm();
  form.append("event_ids", "21");
  form.append("event_ids", "21");
  const result = await createTask({ error: "", success: "" }, form);
  expect(result.error).toBe("Select each Event once");
  expect(rpc).not.toHaveBeenCalled();
});

it("creates separate recurring Task due-date rows", async () => {
  const recurring = taskForm();
  recurring.set("recurrence_frequency", "daily");
  recurring.set("recurrence_interval", "2");
  recurring.set("recurrence_end_mode", "count");
  recurring.set("recurrence_count", "3");
  await createTask({ error: "", success: "" }, recurring);
  expect(rpc).toHaveBeenCalledWith("create_recurring_task_with_events", {
    p_title: " Flyer ",
    p_description: " Prepare the flyer ",
    p_task_type: "Flyer",
    p_branch_id: -5,
    p_points: 1.5,
    p_approval_required: false,
    p_recurrence_rule: "RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3",
    p_request_key: "00000000-0000-4000-8000-000000000002",
    p_due_dates: ["2026-10-15", "2026-10-17", "2026-10-19"],
    p_event_ids: [],
  });
});

it("self-assigns the current Officer through the trusted Task RPC", async () => {
  const form = new FormData();
  form.set("task_id", "-9");
  expect(await selfAssignTask({ error: "", success: "" }, form)).toEqual({
    error: "",
    success: "Task assignment saved",
  });
  expect(rpc).toHaveBeenCalledWith("self_assign_task", { p_task_id: -9 });
  expect(revalidatePath).toHaveBeenCalledWith("/tasks");
  expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
});

it("validates and bulk-adds multiple Officers through the trusted RPC", async () => {
  const form = new FormData();
  form.set("task_id", "-9");
  form.append("officer_ids", "-10");
  form.append("officer_ids", "-11");
  rpc.mockResolvedValue({
    data: { added_officer_ids: [-10], already_assigned_officer_ids: [-11] },
    error: null,
  });
  expect(
    await bulkAssignTaskOfficers({ error: "", success: "" }, form),
  ).toEqual({
    error: "",
    success: "1 officer added; 1 already assigned",
  });
  expect(rpc).toHaveBeenCalledWith("bulk_assign_task_officers", {
    p_task_id: -9,
    p_officer_ids: [-10, -11],
  });
});

it("requires at least one unique Officer for bulk assignment", async () => {
  const form = new FormData();
  form.set("task_id", "-9");
  form.append("officer_ids", "-10");
  form.append("officer_ids", "-10");
  expect(
    await bulkAssignTaskOfficers({ error: "", success: "" }, form),
  ).toMatchObject({ error: "Select each officer once" });
  expect(rpc).not.toHaveBeenCalled();
});

it.each(["true", "false"])(
  "sets manager-controlled completion to %s",
  async (completed) => {
    const form = new FormData();
    form.set("task_id", "-9");
    form.set("officer_id", "-10");
    form.set("completed", completed);
    expect(
      await setTaskAssignmentCompletion({ error: "", success: "" }, form),
    ).toMatchObject({
      error: "",
      success:
        completed === "true" ? "Marked completed" : "Marked not completed",
    });
    expect(rpc).toHaveBeenCalledWith("set_task_assignment_completion", {
      p_task_id: -9,
      p_officer_id: -10,
      p_completed: completed === "true",
    });
  },
);

it("removes only the selected assignment through the trusted RPC", async () => {
  const form = new FormData();
  form.set("task_id", "-9");
  form.set("officer_id", "-10");
  expect(await removeTaskAssignment({ error: "", success: "" }, form)).toEqual({
    error: "",
    success: "Officer removed from task",
  });
  expect(rpc).toHaveBeenCalledWith("remove_task_assignment", {
    p_task_id: -9,
    p_officer_id: -10,
  });
});

it("edits standalone Task details and preserves the filtered-list return path", async () => {
  const form = taskForm();
  form.set("task_id", "9");
  form.set("returnTo", "/tasks?q=flyer&branch=2");
  await editStandaloneTask({ error: "", success: "" }, form);
  expect(rpc).toHaveBeenCalledWith("update_task_details_with_events", {
    p_task_id: 9,
    p_title: " Flyer ",
    p_description: " Prepare the flyer ",
    p_task_type: "Flyer",
    p_branch_id: -5,
    p_due_date: "2026-10-15",
    p_points: 1.5,
    p_event_ids: [],
  });
  expect(redirect).toHaveBeenCalledWith(
    "/tasks/9?returnTo=%2Ftasks%3Fq%3Dflyer%26branch%3D2&feedback=task-updated",
  );
});

it("archives a standalone Task through its trusted RPC", async () => {
  const form = new FormData();
  form.set("task_id", "9");
  expect(await removeTask({ error: "", success: "" }, form)).toEqual({
    error: "",
    success: "Task archived",
  });
  expect(rpc).toHaveBeenCalledWith("remove_task", { p_task_id: 9 });
});

it("restores an archived Task through the trusted RPC", async () => {
  const form = new FormData();
  form.set("task_id", "9");
  expect(await restoreTask({ error: "", success: "" }, form)).toEqual({
    error: "",
    success: "Task restored",
  });
  expect(rpc).toHaveBeenCalledWith("restore_task", { p_task_id: 9 });
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
  await editRecurringTask({ error: "", success: "" }, data);
  expect(rpc).toHaveBeenCalledWith("mutate_recurring_task_with_events", {
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

it("applies changed Event links through the selected recurring edit scope", async () => {
  const { editRecurringTask } = await import("@/app/(protected)/tasks/actions");
  const data = taskForm();
  data.set("task_id", "9");
  data.set("scope", "following");
  data.set("recurrence_series_id", "3");
  data.set("recurrence_revision", "2");
  data.set("mutation_request_key", "00000000-0000-4000-8000-000000000068");
  data.append("event_ids", "21");
  data.append("event_ids", "22");
  data.append("edited_fields", "event_ids");
  await editRecurringTask({ error: "", success: "" }, data);
  expect(rpc).toHaveBeenCalledWith(
    "mutate_recurring_task_with_events",
    expect.objectContaining({ p_scope: "following", p_event_ids: [21, 22] }),
  );
});

it.each(["occurrence", "following", "series"])(
  "recurring Task edit preserves contextual return behavior for %s scope",
  async (scope) => {
    const { editRecurringTask } =
      await import("@/app/(protected)/tasks/actions");
    const data = taskForm();
    data.set("task_id", "9");
    data.set("scope", scope);
    data.set("recurrence_series_id", "3");
    data.set("recurrence_revision", "2");
    data.set("mutation_request_key", "00000000-0000-4000-8000-000000000068");
    data.append("edited_fields", "title");
    data.set("returnTo", "/tasks?q=flyer&branch=2&assignee=7");
    await editRecurringTask({ error: "", success: "" }, data);
    expect(redirect).toHaveBeenCalledWith(
      scope === "series"
        ? "/tasks?q=flyer&branch=2&assignee=7&feedback=task-updated"
        : "/tasks/9?returnTo=%2Ftasks%3Fq%3Dflyer%26branch%3D2%26assignee%3D7&feedback=task-updated",
    );
    expect(rpc).toHaveBeenCalledWith(
      "mutate_recurring_task_with_events",
      expect.objectContaining({
        p_scope: scope,
        p_patch: { title: " Flyer " },
      }),
    );
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_event_ids");
  },
);

it.each(["occurrence", "series"])(
  "recurring Task edit falls back safely for %s scope",
  async (scope) => {
    const { editRecurringTask } =
      await import("@/app/(protected)/tasks/actions");
    for (const returnTo of [
      undefined,
      "//evil.example",
      "/tasks?q=%",
      "/tasks/9?returnTo=%2Ftasks",
    ]) {
      vi.mocked(redirect).mockClear();
      const data = taskForm();
      data.set("task_id", "9");
      data.set("scope", scope);
      data.set("recurrence_series_id", "3");
      data.set("recurrence_revision", "2");
      data.set("mutation_request_key", "00000000-0000-4000-8000-000000000068");
      if (returnTo) data.set("returnTo", returnTo);
      await editRecurringTask({ error: "", success: "" }, data);
      expect(redirect).toHaveBeenCalledWith(
        scope === "series"
          ? "/tasks?feedback=task-updated"
          : "/tasks/9?feedback=task-updated",
      );
    }
  },
);

it("return context does not bypass trusted recurring Task authorization", async () => {
  const { editRecurringTask } = await import("@/app/(protected)/tasks/actions");
  const data = taskForm();
  data.set("task_id", "9");
  data.set("scope", "occurrence");
  data.set("recurrence_series_id", "3");
  data.set("recurrence_revision", "2");
  data.set("mutation_request_key", "00000000-0000-4000-8000-000000000068");
  data.set("returnTo", "/points?page=3");
  rpc.mockResolvedValue({ error: { message: "Task outside branch scope" } });
  expect(
    (await editRecurringTask({ error: "", success: "" }, data)).error,
  ).toBeTruthy();
  expect(redirect).not.toHaveBeenCalled();
});
