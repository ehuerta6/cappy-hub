"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";

export async function createTask(_previous: { error: string }, form: FormData) {
  await getAuthorizationContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_task", {
    p_title: String(form.get("title") ?? ""),
    p_description: String(form.get("description") ?? ""),
    p_task_type: String(form.get("task_type") ?? ""),
    p_branch_id: Number(form.get("branch_id")),
    p_due_date: String(form.get("due_date") ?? ""),
    p_points: Number(form.get("points")),
    p_approval_required: form.get("approval_required") === "on",
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
  const supabase = await createClient();
  const taskId = Number(form.get("task_id"));
  const operation = String(form.get("operation") ?? "");
  const result =
    operation === "assign"
      ? await supabase.rpc("assign_task", {
          p_task_id: taskId,
          p_officer_id: Number(form.get("officer_id")),
        })
      : operation === "complete"
        ? await supabase.rpc("complete_task", { p_task_id: taskId })
        : operation === "approve"
          ? await supabase.rpc("approve_task", { p_task_id: taskId })
          : { error: { message: "Unknown task action" } };
  if (result.error)
    return { error: mutationError(result.error.message), success: "" };
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  return { error: "", success: "Task updated" };
}
