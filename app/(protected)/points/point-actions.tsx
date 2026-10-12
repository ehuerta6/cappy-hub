"use client";
import { useActionState, useEffect, useRef, useState } from "react";
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
  const [removeState, removeAction, removing] = useActionState(
    removePointTransaction,
    initialFormActionState,
  );
  const [editing, setEditing] = useState(false);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (wasEditing.current && !editing) editTrigger.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  return (
    <div className="point-actions">
      {editing ? (
        <EditPointForm
          transactionId={transactionId}
          points={points}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button
          ref={editTrigger}
          type="button"
          className="button-secondary"
          onClick={() => setEditing(true)}
        >
          Edit points
        </button>
      )}
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

function EditPointForm({
  transactionId,
  points,
  onCancel,
}: {
  transactionId: number;
  points: number;
  onCancel: () => void;
}) {
  const [editState, editAction, pending] = useActionState(
    editPointTransaction,
    initialFormActionState,
  );
  const input = useRef<HTMLInputElement>(null);
  const fieldErrors = editState.fieldErrors ?? {};

  useEffect(() => input.current?.focus(), []);

  return (
    <form
      key={JSON.stringify(editState.values ?? {})}
      action={editAction}
      onReset={(event) => event.preventDefault()}
      className="point-edit-form"
    >
      <input type="hidden" name="transaction_id" value={transactionId} />
      <span className="text-muted" aria-live="polite">
        Current amount: {points} points
      </span>
      <label>
        Proposed amount
        <input
          ref={input}
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
      <button disabled={pending}>{pending ? "Saving…" : "Save points"}</button>
      <button
        type="button"
        className="button-secondary"
        disabled={pending}
        onClick={onCancel}
      >
        Cancel
      </button>
      <ActionFeedback state={editState} />
    </form>
  );
}
