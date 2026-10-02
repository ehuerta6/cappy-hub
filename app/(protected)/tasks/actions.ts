"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
import { createTaskInputSchema, taskActionInputSchema } from "./validation";

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
  };
  const validationResult = createTaskInputSchema.safeParse(rawTaskInput);
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message };
  const validatedTaskInput = validationResult.data;
  const supabase = await createClient();
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
