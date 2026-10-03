"use client";

import { useActionState } from "react";
import { changeApplicationRole } from "../actions";

export default function RoleForm({
  officerId,
  role,
}: {
  officerId: number;
  role: string;
}) {
  const [state, action, pending] = useActionState(changeApplicationRole, {
    error: "",
    success: "",
  });
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="officer_id" value={officerId} />
      <label>
        Application role
        <select name="role" defaultValue={role}>
          <option value="officer">Officer</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button type="submit" disabled={pending}>
        Save role
      </button>
      {state.error && (
        <span role="alert" className="text-danger">
          {state.error}
        </span>
      )}
      {state.success && <span role="status">{state.success}</span>}
    </form>
  );
}
