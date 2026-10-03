"use client";

import { useActionState } from "react";
import { ActionFeedback } from "@/components/ui";
import { initialFormActionState } from "@/lib/form-feedback";
import { removeParticipationAward } from "./actions";

export default function RemoveAwardForm({
  transactionId,
}: {
  transactionId: number;
}) {
  const [state, action, pending] = useActionState(
    removeParticipationAward,
    initialFormActionState,
  );
  return (
    <form action={action}>
      <input type="hidden" name="transaction_id" value={transactionId} />
      <button disabled={pending} className="button-secondary">
        {pending ? "Removing…" : "Remove award"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
