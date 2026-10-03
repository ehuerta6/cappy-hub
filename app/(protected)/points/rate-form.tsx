"use client";

import { useActionState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { changeParticipationRate } from "./actions";

export default function RateForm({ rate }: { rate: number }) {
  const [state, action, pending] = useActionState(
    changeParticipationRate,
    initialFormActionState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label>
        Participation points per hour
        <input
          name="rate"
          type="number"
          step="any"
          required
          aria-invalid={Boolean(fieldErrors.rate)}
          aria-describedby={
            fieldErrors.rate ? "participation-rate-error" : undefined
          }
          defaultValue={submittedValue(state.values, "rate", String(rate))}
        />
        <FieldError id="participation-rate-error">
          {fieldErrors.rate}
        </FieldError>
      </label>
      <button disabled={pending}>{pending ? "Saving…" : "Save rate"}</button>
      <ActionFeedback state={state} />
    </form>
  );
}
