"use client";

import { useActionState, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { denverParts } from "@/lib/event-time";
import { saveEvent } from "./actions";
import {
  RecurrenceScope,
  changedFormFields,
  type RecurrenceSeries,
} from "@/components/recurrence-scope";
import { RecurrenceFields } from "@/components/recurrence-fields";

export default function EventForm({
  branches,
  eventTypes,
  locations,
  event,
  branchIds = [],
  allowGlobal = false,
  recurrenceRequestKey,
  series,
  mutationRequestKey,
}: {
  branches: Pick<Tables<"branches">, "id" | "name">[];
  eventTypes: Pick<Tables<"event_types">, "id" | "name">[];
  locations: Pick<Tables<"event_locations">, "id" | "name">[];
  event?: Tables<"events">;
  branchIds?: number[];
  allowGlobal?: boolean;
  recurrenceRequestKey?: string;
  series?: RecurrenceSeries;
  mutationRequestKey?: string;
}) {
  const [state, action, pending] = useActionState(saveEvent, { error: "" });
  const [selectedBranches, setSelectedBranches] = useState(branchIds);

  const [editedFields, setEditedFields] = useState<string[]>([]);
  const original: Record<string, string | string[]> = event
    ? {
        name: event.name,
        description: event.description,
        location: event.location ?? "",
        event_type_id: String(event.event_type_id),
        slides_url: event.slides_url ?? "",
        meeting_notes_url: event.meeting_notes_url ?? "",
        event_date: event.event_date,
        start_time: denverParts(event.starts_at).time,
        end_time: denverParts(event.ends_at).time,
        branches: branchIds.map(String),
      }
    : {};
  return (
    <form
      action={action}
      className="sm:grid-cols-2"
      onChange={(event) => {
        if (series)
          setEditedFields(changedFormFields(event.currentTarget, original));
      }}
    >
      {editedFields.map((field) => (
        <input key={field} type="hidden" name="edited_fields" value={field} />
      ))}
      {event && <input type="hidden" name="id" value={event.id} />}
      {series && event && (
        <>
          <input
            type="hidden"
            name="recurrence_original_date"
            value={event.event_date}
          />
          <input
            type="hidden"
            name="recurrence_original_key"
            value={event.recurrence_key ?? ""}
          />
        </>
      )}
      {!event && recurrenceRequestKey && (
        <input
          type="hidden"
          name="recurrence_request_key"
          value={recurrenceRequestKey}
        />
      )}
      {series && mutationRequestKey && (
        <RecurrenceScope
          series={series}
          requestKey={mutationRequestKey}
          recordType="Event"
          editing
        />
      )}

      <label className="sm:col-span-2">
        Name
        <input name="name" required defaultValue={event?.name} />
      </label>

      <label className="sm:col-span-2">
        Description
        <textarea
          name="description"
          required
          defaultValue={event?.description}
        />
      </label>

      <label>
        Type
        <select
          name="event_type_id"
          required
          defaultValue={event?.event_type_id ?? ""}
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
        <input
          name="location"
          list="event-location-suggestions"
          required
          defaultValue={event?.location ?? ""}
        />
        <datalist id="event-location-suggestions">
          {locations.map((location) => (
            <option key={location.id} value={location.name} />
          ))}
        </datalist>
      </label>

      <label>
        Slides URL (optional)
        <input
          name="slides_url"
          type="url"
          defaultValue={event?.slides_url ?? ""}
        />
      </label>

      <label>
        Meeting notes URL (optional)
        <input
          name="meeting_notes_url"
          type="url"
          defaultValue={event?.meeting_notes_url ?? ""}
        />
      </label>

      <label className="sm:col-span-2">
        Date (El Paso)
        <input
          name="event_date"
          type="date"
          required
          defaultValue={event?.event_date ?? undefined}
        />
      </label>

      <p className="sm:col-span-2">
        Choose one El Paso date. The event must start at or after 6:00 AM and
        end by 11:59 PM.
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

      <fieldset className="sm:col-span-2">
        <legend>
          {allowGlobal
            ? "Branches (optional; none means a global event)"
            : "Branches (select at least one)"}
        </legend>

        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            const next =
              selectedBranches.length === branches.length
                ? []
                : branches.map((branch) => branch.id);
            setSelectedBranches(next);
            if (series)
              setEditedFields((fields) => [
                ...fields.filter((field) => field !== "branch_ids"),
                ...(JSON.stringify([...next].sort()) ===
                JSON.stringify([...branchIds].sort())
                  ? []
                  : ["branch_ids"]),
              ]);
          }}
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

      {!event && <RecurrenceFields recordType="Event" />}

      {state.error && (
        <p role="alert" className="sm:col-span-2">
          {state.error}
        </p>
      )}

      <button disabled={pending}>{pending ? "Saving…" : "Save event"}</button>
    </form>
  );
}
