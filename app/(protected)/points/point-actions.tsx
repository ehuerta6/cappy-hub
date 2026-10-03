"use client";
import { useActionState } from "react";
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
    { error: "", success: "" },
  );
  const [removeState, removeAction, removing] = useActionState(
    removePointTransaction,
    { error: "", success: "" },
  );
  return (
    <div className="space-y-2">
      <form
        action={editAction}
        className="flex min-w-0 flex-wrap items-end gap-2"
      >
        <input type="hidden" name="transaction_id" value={transactionId} />
        <label className="min-w-0 flex-1">
          Points
          <input
            name="points"
            type="number"
            step="any"
            required
            defaultValue={points}
          />
        </label>
        <button disabled={editing}>{editing ? "Saving…" : "Edit"}</button>
      </form>
      {editState.error && <p role="alert">{editState.error}</p>}
      {editState.success && <p role="status">{editState.success}</p>}
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
      {removeState.error && <p role="alert">{removeState.error}</p>}
      {removeState.success && <p role="status">{removeState.success}</p>}
    </div>
  );
}
