"use client";

import { useActionState, useState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { createWarning, decideWarning, voidWarning } from "./warning-actions";

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
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="warning_id" value={warningId} />
      <ConfirmationDialog
        title="Approve warning?"
        description="This records your approval for the warning under the existing leadership approval rules."
        triggerLabel={
          pending && pendingDecision === "approved" ? "Approving…" : "Approve"
        }
        confirmLabel="Approve"
        pending={pending}
        triggerClassName=""
        confirmName="decision"
        confirmValue="approved"
        onConfirm={() => setPendingDecision("approved")}
      />
      <ConfirmationDialog
        title="Reject warning?"
        description="This records your rejection for the warning under the existing leadership decision rules."
        triggerLabel={
          pending && pendingDecision === "rejected" ? "Rejecting…" : "Reject"
        }
        confirmLabel="Reject"
        destructive
        pending={pending}
        triggerClassName=""
        confirmName="decision"
        confirmValue="rejected"
        onConfirm={() => setPendingDecision("rejected")}
      />
      <ActionFeedback state={state} />
    </form>
  );
}

export function VoidWarningForm({
  warningId,
  officerId,
}: {
  warningId: number;
  officerId: number;
}) {
  const [state, action, pending] = useActionState(voidWarning, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="warning_id" value={warningId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <ConfirmationDialog
        title="Void warning?"
        description="This keeps the warning and its approval history, removes it from active warning totals, and cannot be undone."
        triggerLabel={pending ? "Voiding…" : "Void"}
        confirmLabel="Void warning"
        destructive
        pending={pending}
        triggerClassName="button-secondary"
      />
      <ActionFeedback state={state} />
    </form>
  );
}
