"use server";

import { revalidatePath } from "next/cache";
import { safeReturnTo, withReturnTo } from "@/lib/return-context";
import { withSuccessNotice } from "@/lib/mutation-feedback";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
import {
  formFailure,
  validationFailure,
  type FormActionState,
} from "@/lib/form-feedback";
import {
  canonicalRecurrenceRule,
  expandRecurrenceDates,
} from "@/lib/recurrence";
import {
  recurrenceMutation,
  recurrenceMutationError,
} from "@/lib/recurrence-mutation";
import { recurrenceInput } from "@/lib/recurrence-validation";
import {
  bulkTaskAssignmentInputSchema,
  createTaskInputSchema,
  removeTaskAssignmentInputSchema,
  taskRecordInputSchema,
  setTaskCompletionInputSchema,
  taskDetailsInputSchema,
} from "./validation";

const taskFormFields = [
  "title",
  "description",
  "task_type",
  "branch_id",
  "due_date",
  "points",
  "recurrence_frequency",
  "recurrence_interval",
  "recurrence_weekdays",
  "recurrence_end_mode",
  "recurrence_count",
  "recurrence_until",
] as const;
const taskFieldErrors = taskFormFields;
const taskMultipleFields = ["recurrence_weekdays"] as const;

export async function createTask(
  _previous: FormActionState,
  formData: FormData,
) {
  await getAuthorizationContext();
  const rawTaskInput = {
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    task_type: formData.get("task_type") ?? "",
    branch_id: formData.get("branch_id") ?? "",
    due_date: formData.get("due_date") ?? "",
    points: formData.get("points") ?? "",
    recurrence_frequency: formData.get("recurrence_frequency") ?? "none",
    recurrence_request_key:
      formData.get("recurrence_request_key") ?? crypto.randomUUID(),
    recurrence_interval: formData.get("recurrence_interval") ?? "1",
    recurrence_weekdays: formData.getAll("recurrence_weekdays"),
    recurrence_end_mode: formData.get("recurrence_end_mode") ?? "count",
    recurrence_count: formData.get("recurrence_count") ?? "12",
    recurrence_until: formData.get("recurrence_until") ?? "2099-12-31",
  };
  const validationResult = createTaskInputSchema.safeParse(rawTaskInput);
  if (!validationResult.success)
    return validationFailure(
      validationResult.error,
      formData,
      taskFieldErrors,
      taskMultipleFields,
    );
  const validatedTaskInput = validationResult.data;
  const supabase = await createClient();
  const recurrence = recurrenceInput(validatedTaskInput);
  if (recurrence) {
    let dates: string[];
    try {
      dates = expandRecurrenceDates(validatedTaskInput.due_date, recurrence);
    } catch (error) {
      return formFailure(
        error instanceof Error ? error.message : "Invalid recurrence",
        formData,
        taskFormFields,
        undefined,
        taskMultipleFields,
      );
    }
    const { data, error } = await supabase.rpc("create_recurring_task", {
      p_title: validatedTaskInput.title,
      p_description: validatedTaskInput.description,
      p_task_type: validatedTaskInput.task_type,
      p_branch_id: validatedTaskInput.branch_id,
      p_points: validatedTaskInput.points,
      p_approval_required: false,
      p_request_key: validatedTaskInput.recurrence_request_key,
      p_recurrence_rule: canonicalRecurrenceRule(recurrence),
      p_due_dates: dates,
    });
    if (error)
      return formFailure(
        mutationError(error.message),
        formData,
        taskFormFields,
        undefined,
        taskMultipleFields,
      );
    revalidatePath("/tasks");
    redirect(withSuccessNotice(`/tasks#task-${data}`, "task-created"));
  }
  const { data, error } = await supabase.rpc("save_task", {
    p_title: validatedTaskInput.title,
    p_description: validatedTaskInput.description,
    p_task_type: validatedTaskInput.task_type,
    p_branch_id: validatedTaskInput.branch_id,
    p_due_date: validatedTaskInput.due_date,
    p_points: validatedTaskInput.points,
    p_approval_required: false,
  });
  if (error)
    return formFailure(
      mutationError(error.message),
      formData,
      taskFormFields,
      undefined,
      taskMultipleFields,
    );
  revalidatePath("/tasks");
  redirect(withSuccessNotice(`/tasks#task-${data}`, "task-created"));
}

export async function selfAssignTask(
  _previous: FormActionState,
  form: FormData,
) {
  await getAuthorizationContext();
  const validation = taskRecordInputSchema.safeParse({
    task_id: form.get("task_id") ?? "",
  });
  if (!validation.success)
    return validationFailure(validation.error, form, ["task_id"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("self_assign_task", {
    p_task_id: validation.data.task_id,
  });
  if (error)
    return formFailure(mutationError(error.message), form, ["task_id"]);
  revalidatePath("/tasks");
  revalidatePath("/", "layout");
  return { error: "", success: "Task assignment saved" };
}

export async function bulkAssignTaskOfficers(
  _previous: FormActionState,
  form: FormData,
) {
  await getAuthorizationContext();
  const validation = bulkTaskAssignmentInputSchema.safeParse({
    task_id: form.get("task_id") ?? "",
    officer_ids: form.getAll("officer_ids"),
  });
  if (!validation.success)
    return validationFailure(
      validation.error,
      form,
      ["task_id", "officer_ids"],
      ["officer_ids"],
    );
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_assign_task_officers", {
    p_task_id: validation.data.task_id,
    p_officer_ids: validation.data.officer_ids,
  });
  if (error)
    return formFailure(
      mutationError(error.message),
      form,
      ["task_id", "officer_ids"],
      undefined,
      ["officer_ids"],
    );
  const result = data as {
    added_officer_ids?: number[];
    already_assigned_officer_ids?: number[];
  };
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${validation.data.task_id}`);
  revalidatePath("/", "layout");
  const added = result.added_officer_ids?.length ?? 0;
  const existing = result.already_assigned_officer_ids?.length ?? 0;
  return {
    error: "",
    success: `${added} ${added === 1 ? "officer added" : "officers added"}${existing ? `; ${existing} already assigned` : ""}`,
  };
}

export async function setTaskAssignmentCompletion(
  _previous: FormActionState,
  form: FormData,
) {
  await getAuthorizationContext();
  const validation = setTaskCompletionInputSchema.safeParse({
    task_id: form.get("task_id") ?? "",
    officer_id: form.get("officer_id") ?? "",
    completed: form.get("completed") ?? "",
  });
  if (!validation.success)
    return validationFailure(validation.error, form, [
      "task_id",
      "officer_id",
      "completed",
    ]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_task_assignment_completion", {
    p_task_id: validation.data.task_id,
    p_officer_id: validation.data.officer_id,
    p_completed: validation.data.completed,
  });
  if (error)
    return formFailure(mutationError(error.message), form, [
      "task_id",
      "officer_id",
      "completed",
    ]);
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${validation.data.task_id}`);
  revalidatePath("/points");
  revalidatePath("/system-log");
  revalidatePath("/", "layout");
  return {
    error: "",
    success: validation.data.completed
      ? "Marked completed"
      : "Marked not completed",
  };
}

export async function removeTaskAssignment(
  _previous: FormActionState,
  form: FormData,
) {
  await getAuthorizationContext();
  const validation = removeTaskAssignmentInputSchema.safeParse({
    task_id: form.get("task_id") ?? "",
    officer_id: form.get("officer_id") ?? "",
  });
  if (!validation.success)
    return validationFailure(validation.error, form, ["task_id", "officer_id"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_task_assignment", {
    p_task_id: validation.data.task_id,
    p_officer_id: validation.data.officer_id,
  });
  if (error)
    return formFailure(mutationError(error.message), form, [
      "task_id",
      "officer_id",
    ]);
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${validation.data.task_id}`);
  revalidatePath("/system-log");
  revalidatePath("/", "layout");
  return { error: "", success: "Officer removed from task" };
}

export async function removeTask(_previous: FormActionState, form: FormData) {
  await getAuthorizationContext();
  const validation = taskRecordInputSchema.safeParse({
    task_id: form.get("task_id") ?? "",
  });
  if (!validation.success)
    return { error: validation.error.issues[0].message, success: "" };
  const supabase = await createClient();
  let response;
  try {
    response = form.has("recurrence_series_id")
      ? await supabase.rpc(
          "mutate_recurring_task",
          await recurrenceMutation(
            "task",
            validation.data.task_id,
            form,
            "remove",
          ),
        )
      : await supabase.rpc("remove_task", {
          p_task_id: validation.data.task_id,
        });
  } catch (error) {
    return { error: recurrenceMutationError(error), success: "" };
  }
  const { error } = response;
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${validation.data.task_id}`);
  revalidatePath("/calendar");
  return {
    error: "",
    success: form.has("recurrence_series_id")
      ? "Task occurrence archived"
      : "Task archived",
  };
}

export async function restoreTask(_previous: FormActionState, form: FormData) {
  await getAuthorizationContext();
  const validation = taskRecordInputSchema.safeParse({
    task_id: form.get("task_id") ?? "",
  });
  if (!validation.success)
    return { error: validation.error.issues[0].message, success: "" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_task", {
    p_task_id: validation.data.task_id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${validation.data.task_id}`);
  revalidatePath("/calendar");
  revalidatePath("/system-log");
  revalidatePath("/", "layout");
  return { error: "", success: "Task restored" };
}

export async function editStandaloneTask(
  _previous: FormActionState,
  form: FormData,
) {
  await getAuthorizationContext();
  const id = taskRecordInputSchema.safeParse({ task_id: form.get("task_id") });
  const validation = taskDetailsInputSchema.safeParse({
    ...Object.fromEntries(form.entries()),
  });
  if (!id.success)
    return formFailure(id.error.issues[0].message, form, [
      "task_id",
      ...taskFormFields,
    ]);
  if (!validation.success)
    return validationFailure(validation.error, form, [
      "task_id",
      ...taskFormFields.slice(0, 6),
    ]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_task_details", {
    p_task_id: id.data.task_id,
    p_title: validation.data.title,
    p_description: validation.data.description,
    p_task_type: validation.data.task_type,
    p_branch_id: validation.data.branch_id,
    p_due_date: validation.data.due_date,
    p_points: validation.data.points,
  });
  if (error)
    return formFailure(mutationError(error.message), form, [
      "task_id",
      ...taskFormFields.slice(0, 6),
    ]);
  revalidatePath("/", "layout");
  redirect(
    withSuccessNotice(
      withReturnTo(`/tasks/${id.data.task_id}`, form.get("returnTo")),
      "task-updated",
    ),
  );
}

export async function editRecurringTask(
  _previous: FormActionState,
  form: FormData,
) {
  await getAuthorizationContext();
  const id = taskRecordInputSchema.safeParse({ task_id: form.get("task_id") });
  const validation = createTaskInputSchema.safeParse({
    ...Object.fromEntries(form.entries()),
    recurrence_weekdays: form.getAll("recurrence_weekdays"),
  });
  if (!id.success)
    return formFailure(
      id.error.issues[0].message,
      form,
      ["task_id", ...taskFormFields],
      undefined,
      taskMultipleFields,
    );
  if (!validation.success)
    return validationFailure(
      validation.error,
      form,
      ["task_id", ...taskFieldErrors],
      taskMultipleFields,
    );
  try {
    const args = await recurrenceMutation(
      "task",
      id.data.task_id,
      form,
      "edit",
      validation.data,
    );
    const supabase = await createClient();
    const { error } = await supabase.rpc("mutate_recurring_task", args);
    if (error)
      return formFailure(
        mutationError(error.message),
        form,
        ["task_id", ...taskFormFields],
        undefined,
        taskMultipleFields,
      );
  } catch (error) {
    return formFailure(
      recurrenceMutationError(error),
      form,
      ["task_id", ...taskFormFields],
      undefined,
      taskMultipleFields,
    );
  }
  revalidatePath("/", "layout");
  const destination =
    form.get("scope") === "series"
      ? (safeReturnTo(form.get("returnTo")) ?? "/tasks")
      : withReturnTo(`/tasks/${id.data.task_id}`, form.get("returnTo"));
  redirect(withSuccessNotice(destination, "task-updated"));
}
