"use server";

import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { mutationError } from "@/lib/mutation-error";
import {
  formFailure,
  validationFailure,
  type FormActionState,
} from "@/lib/form-feedback";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  catalogMutationInputSchema,
  eventLocationMutationInputSchema,
} from "./validation";

export async function changeCatalog(
  _previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) return formFailure("Admin required", formData, ["name"]);

  const rawCatalogMutationInput = {
    catalog: formData.get("catalog") ?? "",
    operation: formData.get("operation") ?? "",
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
  };
  const isLocation = rawCatalogMutationInput.catalog === "event_location";
  let validatedLocationMutation: ReturnType<
    typeof eventLocationMutationInputSchema.parse
  > | null = null;
  let validatedCatalogMutation: ReturnType<
    typeof catalogMutationInputSchema.parse
  > | null = null;
  if (isLocation) {
    const validationResult = eventLocationMutationInputSchema.safeParse(
      rawCatalogMutationInput,
    );
    if (!validationResult.success)
      return validationFailure(validationResult.error, formData, ["name"]);
    validatedLocationMutation = validationResult.data;
  } else {
    const validationResult = catalogMutationInputSchema.safeParse(
      rawCatalogMutationInput,
    );
    if (!validationResult.success)
      return validationFailure(validationResult.error, formData, ["name"]);
    validatedCatalogMutation = validationResult.data;
  }

  const supabase = await createClient();
  let mutationErrorResponse;
  if (validatedLocationMutation) {
    if (validatedLocationMutation.operation === "create") {
      ({ error: mutationErrorResponse } = await supabase.rpc(
        "create_event_location",
        { p_name: validatedLocationMutation.name },
      ));
    } else if (validatedLocationMutation.operation === "rename") {
      ({ error: mutationErrorResponse } = await supabase.rpc(
        "rename_event_location",
        {
          p_id: validatedLocationMutation.id,
          p_name: validatedLocationMutation.name,
        },
      ));
    } else {
      ({ error: mutationErrorResponse } = await supabase.rpc(
        "delete_event_location",
        { p_id: validatedLocationMutation.id },
      ));
    }
  } else if (validatedCatalogMutation?.catalog === "position") {
    if (validatedCatalogMutation.operation === "create") {
      ({ error: mutationErrorResponse } = await supabase.rpc(
        "create_position",
        {
          p_name: validatedCatalogMutation.name,
        },
      ));
    } else if (validatedCatalogMutation.operation === "rename") {
      ({ error: mutationErrorResponse } = await supabase.rpc(
        "rename_position",
        {
          p_id: validatedCatalogMutation.id,
          p_name: validatedCatalogMutation.name,
        },
      ));
    } else if (validatedCatalogMutation.operation === "delete") {
      ({ error: mutationErrorResponse } = await supabase.rpc(
        "delete_position",
        {
          p_id: validatedCatalogMutation.id,
        },
      ));
    } else {
      ({ error: mutationErrorResponse } = await supabase.rpc(
        "set_position_active",
        {
          p_id: validatedCatalogMutation.id,
          p_is_active: validatedCatalogMutation.operation === "reactivate",
        },
      ));
    }
  } else {
    const branchMutation = validatedCatalogMutation!;
    if (branchMutation.operation === "create") {
      ({ error: mutationErrorResponse } = await supabase.rpc("create_branch", {
        p_name: branchMutation.name,
      }));
    } else if (branchMutation.operation === "rename") {
      ({ error: mutationErrorResponse } = await supabase.rpc("rename_branch", {
        p_id: branchMutation.id,
        p_name: branchMutation.name,
      }));
    } else if (branchMutation.operation === "delete") {
      ({ error: mutationErrorResponse } = await supabase.rpc("delete_branch", {
        p_id: branchMutation.id,
      }));
    } else {
      ({ error: mutationErrorResponse } = await supabase.rpc(
        "set_branch_active",
        {
          p_id: branchMutation.id,
          p_is_active: branchMutation.operation === "reactivate",
        },
      ));
    }
  }
  if (mutationErrorResponse)
    return formFailure(
      mutationErrorResponse.code === "23505"
        ? "A record with this name already exists"
        : mutationError(mutationErrorResponse.message),
      formData,
      ["name"],
    );
  revalidatePath("/", "layout");
  const subject = validatedLocationMutation
    ? "Event location"
    : validatedCatalogMutation?.catalog === "branch"
      ? "Branch"
      : "Position";
  const operation =
    validatedLocationMutation?.operation ?? validatedCatalogMutation?.operation;
  const verb =
    operation === "create"
      ? "added"
      : operation === "rename"
        ? "updated"
        : operation === "delete"
          ? "removed"
          : operation === "retire"
            ? "retired"
            : "reactivated";
  return { error: "", success: `${subject} ${verb}` };
}
