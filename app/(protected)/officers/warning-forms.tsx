"use client";

import { useActionState, useState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { createWarning, decideWarning, deleteWarning } from "./warning-actions";

const initial = initialFormActionState;

export function CreateWarningForm({ officerId }: { officerId: number }) {
  const [state, action, pending] = useActionState(createWarning, initial);
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="officer_id" value={officerId} />
      <label>
        Reason
        <textarea
          name="reason"
          required
          rows={3}
          aria-invalid={Boolean(fieldErrors.reason)}
          aria-describedby={
            fieldErrors.reason ? "warning-reason-error" : undefined
          }
          defaultValue={submittedValue(state.values, "reason")}
        />
        <FieldError id="warning-reason-error">{fieldErrors.reason}</FieldError>
      </label>
      <p className="text-sm text-muted">
        The warning starts pending and requires approval from the current
        President and Vice Presidents. Its reason cannot be edited afterward.
      </p>
      <ActionFeedback state={state} />
      <button disabled={pending}>
        {pending ? "Creating…" : "Create warning"}
      </button>
    </form>
  );
}

export function WarningDecisionForm({ warningId }: { warningId: number }) {
  const [state, action, pending] = useActionState(decideWarning, initial);
  const [pendingDecision, setPendingDecision] = useState<
    "approved" | "rejected" | null
  >(null);
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
        else
          setPendingDecision(
            button?.value === "rejected" ? "rejected" : "approved",
          );
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="warning_id" value={warningId} />
      <button name="decision" value="approved" disabled={pending}>
        {pending && pendingDecision === "approved" ? "Approving…" : "Approve"}
      </button>
      <button name="decision" value="rejected" disabled={pending}>
        {pending && pendingDecision === "rejected" ? "Rejecting…" : "Reject"}
      </button>
      <ActionFeedback state={state} />
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
      <ActionFeedback state={state} />
    </form>
  );
}
