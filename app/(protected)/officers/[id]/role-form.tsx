"use client";

import { useActionState, useEffect } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
import { emitToast } from "@/components/toast-region";
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

  useEffect(() => {
    if (state.success) emitToast(state.success, "success");
  }, [state.success]);

  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="flex flex-wrap items-end gap-3"
    >
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="officer_id" value={officerId} />
      <label>
        Access level
        <select
          key={role}
          name="role"
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.role)}
          aria-describedby={fieldErrors.role ? "officer-role-error" : undefined}
          defaultValue={submittedValue(state.values, "role", role)}
        >
          <option value="officer">Officer</option>
          <option value="admin">Admin</option>
        </select>
        <FieldError id="officer-role-error">{fieldErrors.role}</FieldError>
      </label>
      <button type="submit" className="button-secondary" disabled={pending}>
        {pending ? "Saving…" : "Save role"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
