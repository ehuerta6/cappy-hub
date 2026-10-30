"use client";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import {
  editPointTransaction,
  removePointTransaction,
  confirmPrematureParticipation,
} from "./actions";
import {
  usePointHistoryAmount,
  useSetPointHistoryAmount,
} from "./point-history-state";

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
  const [editSuccess, setEditSuccess] = useState("");
  const currentPoints = usePointHistoryAmount(transactionId, points);
  const setAmount = useSetPointHistoryAmount();
  const handleEditSuccess = useCallback(
    (amount: number, message: string) => {
      setAmount(transactionId, amount);
      setEditSuccess(message);
      setEditing(false);
    },
    [setAmount, transactionId],
  );
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
          points={currentPoints}
          onCancel={() => setEditing(false)}
          onSuccess={handleEditSuccess}
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
      {editSuccess && (
        <ActionFeedback state={{ error: "", success: editSuccess }} />
      )}
    </div>
  );
}

function EditPointForm({
  transactionId,
  points,
  onCancel,
  onSuccess,
}: {
  transactionId: number;
  points: number;
  onCancel: () => void;
  onSuccess: (amount: number, message: string) => void;
}) {
  const [editState, editAction, pending] = useActionState(
    editPointTransaction,
    initialFormActionState,
  );
  const input = useRef<HTMLInputElement>(null);
  const proposedAmount = useRef(points);
  const fieldErrors = editState.fieldErrors ?? {};

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (editState.success) onSuccess(proposedAmount.current, editState.success);
  }, [editState.success, onSuccess]);

  return (
    <form
      key={JSON.stringify(editState.values ?? {})}
      action={editAction}
      onSubmit={(event) => {
        const formData = new FormData(event.currentTarget);
        proposedAmount.current = Number(formData.get("points"));
      }}
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

export function PrematureParticipationConfirmation({
  transactionId,
}: {
  transactionId: number;
}) {
  const [state, action, pending] = useActionState(
    confirmPrematureParticipation,
    initialFormActionState,
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="transaction_id" value={transactionId} />
      <ConfirmationDialog
        title="Confirm this award was premature?"
        description="Confirm this removed award was issued before the Event actually happened. Its removal and history stay intact. Eligible participation may be awarded once after the corrected Event ends. Use only after verifying the original award was premature."
        triggerLabel="Confirm premature award"
        confirmLabel="Confirm verified premature award"
        pending={pending}
        triggerClassName="button-secondary"
      >
        <label>
          Verification reason
          <input
            name="reason"
            required
            defaultValue={submittedValue(state.values, "reason", "")}
          />
        </label>
      </ConfirmationDialog>
      <ActionFeedback state={state} />
    </form>
  );
}
