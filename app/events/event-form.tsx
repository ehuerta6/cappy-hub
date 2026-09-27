"use client";
import { useActionState } from "react";
import type { Tables } from "@/lib/database.types";
import { saveEvent } from "./actions";
export default function EventForm({
  branches,
  event,
  branchIds = [],
}: {
  branches: Pick<Tables<"branches">, "id" | "name">[];
  event?: Tables<"events">;
  branchIds?: number[];
}) {
  const [state, action, pending] = useActionState(saveEvent, { error: "" });
  // UTC keeps server-rendered defaults and submitted timestamps consistent across computers.
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
        <input
          name="type"
          list="event-types"
          required
          defaultValue={event?.type ?? "General"}
        />
      </label>
      <datalist id="event-types">
        {["General", "Intro", "ICPC", "Meeting", "Social", "Workshop"].map(
          (type) => (
            <option key={type} value={type} />
          ),
        )}
      </datalist>
      <label>
        Location
        <input name="location" defaultValue={event?.location ?? ""} />
      </label>
      <p>
        Enter start and end in UTC (24-hour time). Times on this prototype are
        displayed in UTC.
      </p>
      <label>
        Start (UTC)
        <input
          name="starts_at"
          type="datetime-local"
          step="1"
          required
          defaultValue={
            event
              ? new Date(event.starts_at).toISOString().slice(0, 19)
              : undefined
          }
        />
      </label>
      <label>
        End (UTC)
        <input
          name="ends_at"
          type="datetime-local"
          step="1"
          required
          defaultValue={
            event
              ? new Date(event.ends_at).toISOString().slice(0, 19)
              : undefined
          }
        />
      </label>
      <fieldset>
        <legend>Branches (at least one)</legend>
        {branches.map((branch) => (
          <label key={branch.id}>
            <input
              type="checkbox"
              name="branches"
              value={branch.id}
              defaultChecked={branchIds.includes(branch.id)}
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
