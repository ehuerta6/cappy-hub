"use client";

import { useActionState } from "react";
import { createWarning, decideWarning, deleteWarning } from "./warning-actions";

const initial = { error: "", success: "" };

export function CreateWarningForm({ officerId }: { officerId: number }) {
  const [state, action, pending] = useActionState(createWarning, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="officer_id" value={officerId} />
      <label>
        Reason
        <textarea name="reason" required rows={3} />
      </label>
      <p className="text-sm text-zinc-400">
        The warning starts pending and requires approval from the current
        President and Vice Presidents. Its reason cannot be edited afterward.
      </p>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <button disabled={pending}>
        {pending ? "Creating…" : "Create warning"}
      </button>
    </form>
  );
}

export function WarningDecisionForm({ warningId }: { warningId: number }) {
  const [state, action, pending] = useActionState(decideWarning, initial);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const button = (event.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        const decision = button?.value === "rejected" ? "reject" : "approve";
        if (
          !window.confirm(`Are you sure you want to ${decision} this warning?`)
        )
          event.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="warning_id" value={warningId} />
      <button name="decision" value="approved" disabled={pending}>
        Approve
      </button>
      <button name="decision" value="rejected" disabled={pending}>
        Reject
      </button>
      {state.error && <span role="alert">{state.error}</span>}
      {state.success && <span role="status">{state.success}</span>}
    </form>
  );
}

export function DeleteWarningForm({
  warningId,
  officerId,
}: {
  warningId: number;
  officerId: number;
}) {
  const [state, action, pending] = useActionState(deleteWarning, initial);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Delete this warning? Its System Log record will remain.",
          )
        )
          event.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="warning_id" value={warningId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <button disabled={pending}>{pending ? "Deleting…" : "Delete"}</button>
      {state.error && <span role="alert">{state.error}</span>}
      {state.success && <span role="status">{state.success}</span>}
    </form>
  );
}
