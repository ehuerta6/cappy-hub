"use client";

import { useActionState } from "react";
import { changeParticipationRate } from "./actions";

export default function RateForm({ rate }: { rate: number }) {
  const [state, action, pending] = useActionState(changeParticipationRate, {
    error: "",
    success: "",
  });
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label>
        Participation points per hour
        <input
          name="rate"
          type="number"
          step="any"
          required
          defaultValue={rate}
        />
      </label>
      <button disabled={pending}>Save rate</button>
      {state.error && <span role="alert">{state.error}</span>}
      {state.success && <span role="status">{state.success}</span>}
    </form>
  );
}
