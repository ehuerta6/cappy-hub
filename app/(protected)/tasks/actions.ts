"use server";

import { revalidatePath } from "next/cache";
import { safeReturnTo, withReturnTo } from "@/lib/return-context";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
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
  createTaskInputSchema,
  taskActionInputSchema,
  taskRecordInputSchema,
} from "./validation";

export async function createTask(
  _previous: { error: string },
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
    approval_required: formData.get("approval_required") ?? "",
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
    return { error: validationResult.error.issues[0].message };
  const validatedTaskInput = validationResult.data;
  const supabase = await createClient();
  const recurrence = recurrenceInput(validatedTaskInput);
  if (recurrence) {
    let dates: string[];
    try {
      dates = expandRecurrenceDates(validatedTaskInput.due_date, recurrence);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Invalid recurrence",
      };
    }
    const { data, error } = await supabase.rpc("create_recurring_task", {
      p_title: validatedTaskInput.title,
      p_description: validatedTaskInput.description,
      p_task_type: validatedTaskInput.task_type,
      p_branch_id: validatedTaskInput.branch_id,
      p_points: validatedTaskInput.points,
      p_approval_required: validatedTaskInput.approval_required,
      p_request_key: validatedTaskInput.recurrence_request_key,
      p_recurrence_rule: canonicalRecurrenceRule(recurrence),
      p_due_dates: dates,
    });
    if (error) return { error: mutationError(error.message) };
    revalidatePath("/tasks");
    redirect(`/tasks#task-${data}`);
  }
  const { data, error } = await supabase.rpc("save_task", {
    p_title: validatedTaskInput.title,
    p_description: validatedTaskInput.description,
    p_task_type: validatedTaskInput.task_type,
    p_branch_id: validatedTaskInput.branch_id,
    p_due_date: validatedTaskInput.due_date,
    p_points: validatedTaskInput.points,
    p_approval_required: validatedTaskInput.approval_required,
  });
  if (error) return { error: mutationError(error.message) };
  revalidatePath("/tasks");
  redirect(`/tasks#task-${data}`);
}

export async function updateTask(
  _previous: { error: string; success: string },
  form: FormData,
) {
  await getAuthorizationContext();
  const rawTaskActionInput = {
    task_id: form.get("task_id") ?? "",
    operation: form.get("operation") ?? "",
    officer_id: form.get("officer_id") ?? "",
  };
  const validationResult = taskActionInputSchema.safeParse(rawTaskActionInput);
  if (!validationResult.success)
    return {
      error: validationResult.error.issues[0].message,
      success: "",
    };
  const validatedTaskActionInput = validationResult.data;
  const supabase = await createClient();
  let mutationResponse;
  if (validatedTaskActionInput.operation === "assign") {
    mutationResponse = await supabase.rpc("assign_task", {
      p_task_id: validatedTaskActionInput.task_id,
      p_officer_id: validatedTaskActionInput.officer_id,
    });
  } else if (validatedTaskActionInput.operation === "complete") {
    mutationResponse = await supabase.rpc("complete_task", {
      p_task_id: validatedTaskActionInput.task_id,
    });
  } else {
    mutationResponse = await supabase.rpc("approve_task", {
      p_task_id: validatedTaskActionInput.task_id,
    });
  }
  if (mutationResponse.error)
    return {
      error: mutationError(mutationResponse.error.message),
      success: "",
    };
  const taskId = validatedTaskActionInput.task_id;
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  return { error: "", success: "Task updated" };
}

export async function removeTask(
  _previous: { error: string; success: string },
  form: FormData,
) {
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
  return { error: "", success: "Task occurrence removed" };
}

export async function editRecurringTask(
  _previous: { error: string },
  form: FormData,
) {
  await getAuthorizationContext();
  const id = taskRecordInputSchema.safeParse({ task_id: form.get("task_id") });
  const validation = createTaskInputSchema.safeParse({
    ...Object.fromEntries(form.entries()),
    approval_required: form.get("approval_required") ?? "",
    recurrence_weekdays: form.getAll("recurrence_weekdays"),
  });
  if (!id.success) return { error: id.error.issues[0].message };
  if (!validation.success) return { error: validation.error.issues[0].message };
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
    if (error) return { error: mutationError(error.message) };
  } catch (error) {
    return { error: recurrenceMutationError(error) };
  }
  revalidatePath("/", "layout");
  redirect(
    form.get("scope") === "series"
      ? (safeReturnTo(form.get("returnTo")) ?? "/tasks")
      : withReturnTo(`/tasks/${id.data.task_id}`, form.get("returnTo")),
  );
  return { error: "" };
}
