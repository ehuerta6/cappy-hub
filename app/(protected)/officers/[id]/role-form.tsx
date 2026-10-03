"use client";

import { useActionState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { changeApplicationRole } from "../actions";

export default function RoleForm({
  officerId,
  role,
}: {
  officerId: number;
  role: string;
}) {
  const [state, action, pending] = useActionState(
    changeApplicationRole,
    initialFormActionState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="officer_id" value={officerId} />
      <label>
        Application role
        <select
          name="role"
          aria-invalid={Boolean(fieldErrors.role)}
          aria-describedby={fieldErrors.role ? "officer-role-error" : undefined}
          defaultValue={submittedValue(state.values, "role", role)}
        >
          <option value="officer">Officer</option>
          <option value="admin">Admin</option>
        </select>
        <FieldError id="officer-role-error">{fieldErrors.role}</FieldError>
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save role"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
