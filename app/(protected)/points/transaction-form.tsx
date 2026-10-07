"use client";
import { useActionState, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { formatEventFilterOption } from "@/lib/presentation";
import { ActionFeedback, FieldError, FormMessage } from "@/components/ui";
import { addTransaction, searchEvents } from "./actions";
export default function TransactionForm({
  officers,
  events,
}: {
  officers: Pick<Tables<"officers">, "id" | "name">[];
  events: Pick<Tables<"events">, "id" | "name" | "event_date">[];
}) {
  const [search, setSearch] = useState("");
  const [older, setOlder] = useState(events);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [state, action, pending] = useActionState(
    addTransaction,
    initialFormActionState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form action={action} className="md:grid-cols-2 md:max-w-none">
      <label className="md:col-span-2">
        Officer
        <select
          name="officer_id"
          required
          aria-invalid={Boolean(fieldErrors.officer_id)}
          aria-describedby={
            fieldErrors.officer_id ? "transaction-officer-error" : undefined
          }
          defaultValue={submittedValue(state.values, "officer_id")}
        >
          <option value="">Select officer</option>
          {officers.map((officer) => (
            <option key={officer.id} value={officer.id}>
              {officer.name}
            </option>
          ))}
        </select>
        <FieldError id="transaction-officer-error">
          {fieldErrors.officer_id}
        </FieldError>
      </label>
      <label>
        Points
        <input
          name="points"
          type="number"
          step="any"
          required
          aria-invalid={Boolean(fieldErrors.points)}
          aria-describedby={
            fieldErrors.points ? "transaction-points-error" : undefined
          }
          defaultValue={submittedValue(state.values, "points")}
        />
        <FieldError id="transaction-points-error">
          {fieldErrors.points}
        </FieldError>
      </label>
      <label className="md:col-span-2">
        Reason
        <input
          name="reason"
          required
          aria-invalid={Boolean(fieldErrors.reason)}
          aria-describedby={
            fieldErrors.reason ? "transaction-reason-error" : undefined
          }
          defaultValue={submittedValue(state.values, "reason")}
        />
        <FieldError id="transaction-reason-error">
          {fieldErrors.reason}
        </FieldError>
      </label>
      <label>
        Award type
        <select
          name="award_type"
          aria-invalid={Boolean(fieldErrors.award_type)}
          aria-describedby={
            fieldErrors.award_type ? "transaction-award-type-error" : undefined
          }
          defaultValue={submittedValue(state.values, "award_type", "manual")}
        >
          <option value="manual">Manual</option>
          <option value="correction">Correction</option>
        </select>
        <FieldError id="transaction-award-type-error">
          {fieldErrors.award_type}
        </FieldError>
      </label>
      <label>
        Search older events
        <input
          type="search"
          value={search}
          onChange={(change) => setSearch(change.target.value)}
          placeholder="At least two letters"
        />
      </label>
      <button
        type="button"
        className="button-secondary"
        disabled={searching || search.trim().length < 2}
        onClick={async () => {
          setSearching(true);
          setSearchError("");
          try {
            setOlder(await searchEvents(search));
          } catch {
            setSearchError("Could not search events");
          } finally {
            setSearching(false);
          }
        }}
      >
        {searching ? "Searching…" : "Search events"}
      </button>
      {searchError && <FormMessage kind="error">{searchError}</FormMessage>}
      <label>
        Event (optional)
        <select
          name="event_id"
          aria-invalid={Boolean(fieldErrors.event_id)}
          aria-describedby={
            fieldErrors.event_id ? "transaction-event-error" : undefined
          }
          defaultValue={submittedValue(state.values, "event_id")}
        >
          <option value="">No event</option>
          {older.map((event) => (
            <option key={event.id} value={event.id}>
              {formatEventFilterOption(event.name, event.event_date)}
            </option>
          ))}
        </select>
        <FieldError id="transaction-event-error">
          {fieldErrors.event_id}
        </FieldError>
      </label>
      <ActionFeedback state={state} />
      <button disabled={pending} className="md:col-span-2">
        {pending ? "Adding…" : "+ Add transaction"}
      </button>
    </form>
  );
}
