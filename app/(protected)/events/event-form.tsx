"use client";
import { useActionState, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { denverParts } from "@/lib/event-time";
import { saveEvent } from "./actions";
export default function EventForm({
  branches,
  eventTypes,
  event,
  branchIds = [],
}: {
  branches: Pick<Tables<"branches">, "id" | "name">[];
  eventTypes: Pick<Tables<"event_types">, "id" | "name">[];
  event?: Tables<"events">;
  branchIds?: number[];
}) {
  const [state, action, pending] = useActionState(saveEvent, { error: "" });
  const [kind, setKind] = useState(
    event?.starts_at === null ? "untimed" : "timed",
  );
  const [selectedBranches, setSelectedBranches] = useState(branchIds);
  return (
    <form action={action}>
      {event && <input type="hidden" name="id" value={event.id} />}
      <label>
        Name
        <input name="name" required defaultValue={event?.name} />
      </label>
      <label>
        Description
        <textarea name="description" defaultValue={event?.description} />
      </label>
      <label>
        Type
        <select
          name="event_type_id"
          required
          defaultValue={
            event?.event_type_id ??
            eventTypes.find((type) => type.name === "General")?.id ??
            ""
          }
        >
          <option value="" disabled>
            Select an event type
          </option>
          {eventTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Location
        <input name="location" defaultValue={event?.location ?? ""} />
      </label>
      <label>
        Event kind
        <select
          name="kind"
          value={kind}
          onChange={(change) => setKind(change.target.value)}
        >
          <option value="timed">Timed event</option>
          <option value="untimed">Untimed work event</option>
        </select>
      </label>
      <label>
        Date (El Paso)
        <input
          name="event_date"
          type="date"
          required
          defaultValue={event?.event_date ?? undefined}
        />
      </label>
      {kind === "timed" ? (
        <>
          <p>
            Choose one El Paso date. The event must start at or after 6:00 AM
            and end by 11:59 PM.
          </p>
          <label>
            Start time
            <input
              name="start_time"
              type="time"
              min="06:00"
              max="23:59"
              required
              defaultValue={
                event?.starts_at ? denverParts(event.starts_at).time : undefined
              }
            />
          </label>
          <label>
            End time
            <input
              name="end_time"
              type="time"
              min="06:00"
              max="23:59"
              required
              defaultValue={
                event?.ends_at ? denverParts(event.ends_at).time : undefined
              }
            />
          </label>
        </>
      ) : (
        <label>
          Fixed points
          <input
            name="fixed_points"
            type="number"
            step="any"
            required
            defaultValue={event?.fixed_points ?? undefined}
          />
        </label>
      )}
      <fieldset>
        <legend>Branches (optional; none means a global event)</legend>
        <button
          type="button"
          className="button-secondary"
          onClick={() =>
            setSelectedBranches(
              selectedBranches.length === branches.length
                ? []
                : branches.map((branch) => branch.id),
            )
          }
        >
          {selectedBranches.length === branches.length
            ? "Clear all"
            : "Select all"}
        </button>
        {branches.map((branch) => (
          <label key={branch.id}>
            <input
              type="checkbox"
              name="branches"
              value={branch.id}
              checked={selectedBranches.includes(branch.id)}
              onChange={() =>
                setSelectedBranches(
                  selectedBranches.includes(branch.id)
                    ? selectedBranches.filter((id) => id !== branch.id)
                    : [...selectedBranches, branch.id],
                )
              }
            />
            {branch.name}
          </label>
        ))}
      </fieldset>
      {state.error && <p role="alert">{state.error}</p>}
      <button disabled={pending}>{pending ? "Saving…" : "Save event"}</button>
    </form>
  );
}
