"use client";
import { useActionState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
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
    <div className="space-y-2">
      <form action={editAction} className="flex items-end gap-2">
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
        <button disabled={editing}>{editing ? "Saving…" : "Edit"}</button>
      </form>
      <ActionFeedback state={editState} />
      <form
        action={removeAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Remove this transaction? It will stop counting in totals.",
            )
          )
            event.preventDefault();
        }}
      >
        <input type="hidden" name="transaction_id" value={transactionId} />
        <button disabled={removing} className="button-secondary">
          {removing ? "Removing…" : "Remove"}
        </button>
      </form>
      <ActionFeedback state={removeState} />
    </div>
  );
}
