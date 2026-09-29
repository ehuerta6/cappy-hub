"use client";
import { useActionState, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { addTransaction, searchEvents } from "./actions";
export default function TransactionForm({
  officers,
  events,
}: {
  officers: Pick<Tables<"officers">, "id" | "name">[];
  events: Pick<Tables<"events">, "id" | "name">[];
}) {
  const [search, setSearch] = useState("");
  const [older, setOlder] = useState(events);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
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
      {searchError && <p role="alert">{searchError}</p>}
      <label>
        Event (optional)
        <select name="event_id" defaultValue="">
          <option value="">No event</option>
          {older.map((event) => (
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
