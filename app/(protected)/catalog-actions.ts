"use server";

import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { mutationError } from "@/lib/mutation-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Catalog = "position" | "branch";
type Operation = "create" | "rename" | "delete";

export async function changeCatalog(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) return { error: "Admin required", success: "" };

  const catalog = formData.get("catalog") as Catalog;
  const operation = formData.get("operation") as Operation;
  const name = String(formData.get("name") ?? "").trim();
  const id = Number(formData.get("id"));
  if (
    !["position", "branch"].includes(catalog) ||
    !["create", "rename", "delete"].includes(operation)
  )
    return { error: "Invalid catalog operation", success: "" };
  if (operation !== "delete" && !name)
    return { error: "Name is required", success: "" };
  if (operation !== "create" && (!Number.isSafeInteger(id) || id <= 0))
    return { error: "Invalid catalog record", success: "" };

  const supabase = await createClient();
  let error;
  if (catalog === "position") {
    if (operation === "create")
      ({ error } = await supabase.rpc("create_position", { p_name: name }));
    if (operation === "rename")
      ({ error } = await supabase.rpc("rename_position", {
        p_id: id,
        p_name: name,
      }));
    if (operation === "delete")
      ({ error } = await supabase.rpc("delete_position", { p_id: id }));
  } else if (catalog === "branch") {
    if (operation === "create")
      ({ error } = await supabase.rpc("create_branch", { p_name: name }));
    if (operation === "rename")
      ({ error } = await supabase.rpc("rename_branch", {
        p_id: id,
        p_name: name,
      }));
    if (operation === "delete")
      ({ error } = await supabase.rpc("delete_branch", { p_id: id }));
  }
  if (error)
    return {
      error:
        error.code === "23505"
          ? "A record with this name already exists"
          : mutationError(error.message),
      success: "",
    };
  revalidatePath("/", "layout");
  return { error: "", success: "Saved" };
}
