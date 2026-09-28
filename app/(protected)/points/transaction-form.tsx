"use client";
import { useActionState } from "react";
import type { Tables } from "@/lib/database.types";
import { addTransaction } from "./actions";
export default function TransactionForm({
  officers,
  events,
}: {
  officers: Pick<Tables<"officers">, "id" | "name">[];
  events: Pick<Tables<"events">, "id" | "name">[];
}) {
  const [state, action, pending] = useActionState(addTransaction, {
    error: "",
    success: "",
  });
  return (
    <form action={action} className="md:grid-cols-2 md:max-w-none">
      <label className="md:col-span-2">
        Officer
        <select name="officer_id" required defaultValue="">
          <option value="">Select officer</option>
          {officers.map((officer) => (
            <option key={officer.id} value={officer.id}>
              {officer.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Points
        <input name="points" type="number" step="any" required />
      </label>
      <label className="md:col-span-2">
        Reason
        <input name="reason" required />
      </label>
      <label>
        Award type
        <select name="award_type">
          <option value="manual">Manual</option>
          <option value="correction">Correction</option>
        </select>
      </label>
      <label>
        Event (optional)
        <select name="event_id" defaultValue="">
          <option value="">No event</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
      </label>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <button disabled={pending} className="md:col-span-2">
        {pending ? "Saving…" : "+ Add transaction"}
      </button>
    </form>
  );
}
