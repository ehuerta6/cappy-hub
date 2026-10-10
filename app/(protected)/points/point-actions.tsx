"use client";
import { useActionState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { editPointTransaction, removePointTransaction } from "./actions";

export default function PointActions({
  transactionId,
  points,
}: {
  transactionId: number;
  points: number;
}) {
  const [editState, editAction, editing] = useActionState(
    editPointTransaction,
    initialFormActionState,
  );
  const [removeState, removeAction, removing] = useActionState(
    removePointTransaction,
    initialFormActionState,
  );
  const fieldErrors = editState.fieldErrors ?? {};
  return (
    <div className="point-actions">
      <details
        className="point-edit-disclosure"
        open={Boolean(editState.error)}
      >
        <summary className="button-secondary">Edit points</summary>
        <form action={editAction} className="point-edit-form">
          <input type="hidden" name="transaction_id" value={transactionId} />
          <label>
            Points
            <input
              name="points"
              type="number"
              step="any"
              required
              aria-invalid={Boolean(fieldErrors.points)}
              aria-describedby={
                fieldErrors.points
                  ? `transaction-${transactionId}-points-error`
                  : undefined
              }
              defaultValue={submittedValue(
                editState.values,
                "points",
                String(points),
              )}
            />
            <FieldError id={`transaction-${transactionId}-points-error`}>
              {fieldErrors.points}
            </FieldError>
          </label>
          <button disabled={editing}>
            {editing ? "Saving…" : "Save points"}
          </button>
        </form>
        <ActionFeedback state={editState} />
      </details>
      <form action={removeAction} className="point-remove-form">
        <input type="hidden" name="transaction_id" value={transactionId} />
        <ConfirmationDialog
          title="Remove Point transaction?"
          description="This marks the Point transaction as removed, so it no longer counts in totals. The removal is recorded in the System Log."
          triggerLabel={removing ? "Removing…" : "Remove"}
          confirmLabel="Remove transaction"
          destructive
          pending={removing}
          triggerClassName="button-secondary"
        />
      </form>
      <ActionFeedback state={removeState} />
    </div>
  );
}
