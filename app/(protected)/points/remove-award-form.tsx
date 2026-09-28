"use client";

import { useActionState } from "react";
import { removeParticipationAward } from "./actions";

export default function RemoveAwardForm({
  transactionId,
}: {
  transactionId: number;
}) {
  const [state, action, pending] = useActionState(removeParticipationAward, {
    error: "",
    success: "",
  });
  return (
    <form action={action}>
      <input type="hidden" name="transaction_id" value={transactionId} />
      <button disabled={pending} className="button-secondary">
        Remove award
      </button>
      {state.error && <span role="alert">{state.error}</span>}
      {state.success && <span role="status">{state.success}</span>}
    </form>
  );
}
