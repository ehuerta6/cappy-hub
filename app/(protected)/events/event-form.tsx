"use client";

import { useActionState, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { denverParts } from "@/lib/event-time";
import {
  initialFormActionState,
  submittedValue,
  submittedValues,
} from "@/lib/form-feedback";
import { ActionFeedback, FieldError } from "@/components/ui";
import { saveEvent } from "./actions";
import {
  RecurrenceScope,
  changedFormFields,
  type RecurrenceSeries,
} from "@/components/recurrence-scope";
import { RecurrenceFields } from "@/components/recurrence-fields";

export default function EventForm({
  returnTo,
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
  returnTo?: string;
  branches: Pick<Tables<"branches">, "id" | "name">[];
  eventTypes: (Pick<Tables<"event_types">, "id" | "name"> & {
    available_for_new_events?: boolean;
  })[];
  locations: Pick<Tables<"event_locations">, "id" | "name">[];
  event?: Tables<"events">;
  branchIds?: number[];
  allowGlobal?: boolean;
  recurrenceRequestKey?: string;
  series?: RecurrenceSeries;
  mutationRequestKey?: string;
}) {
  const [state, action, pending] = useActionState(
    saveEvent,
    initialFormActionState,
  );
  const [selectedBranches, setSelectedBranches] = useState(() =>
    submittedValues(state.values, "branches", branchIds.map(String)).map(
      Number,
    ),
  );
  const fieldErrors = state.fieldErrors ?? {};

  const [editedFields, setEditedFields] = useState<string[]>([]);
  const original: Record<string, string | string[]> = event
    ? {
        name: event.name,
        description: event.description,
        location: event.location ?? "",
        event_type_id: String(event.event_type_id),
        slides_url: event.slides_url ?? "",
        meeting_notes_url: event.meeting_notes_url ?? "",
        signup_sheet_url: event.signup_sheet_url ?? "",
        max_volunteers: event.max_volunteers?.toString() ?? "",
        event_date: event.event_date,
        start_time: denverParts(event.starts_at).time,
        end_time: denverParts(event.ends_at).time,
        branches: branchIds.map(String),
      }
    : {};
  return (
    <form
      action={action}
      className="grid-cols-2"
      onChange={(event) => {
        if (series)
          setEditedFields(changedFormFields(event.currentTarget, original));
      }}
    >
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
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
          selectedKey={event?.recurrence_key}
          selectedDate={event?.event_date}
          values={state.values}
          fieldErrors={fieldErrors}
        />
      )}

      <label className="col-span-2">
        Name
        <input
          name="name"
          required
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "event-name-error" : undefined}
          defaultValue={submittedValue(state.values, "name", event?.name ?? "")}
        />
        <FieldError id="event-name-error">{fieldErrors.name}</FieldError>
      </label>

      <label className="col-span-2">
        Description
        <textarea
          name="description"
          required
          aria-invalid={Boolean(fieldErrors.description)}
          aria-describedby={
            fieldErrors.description ? "event-description-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "description",
            event?.description ?? "",
          )}
        />
        <FieldError id="event-description-error">
          {fieldErrors.description}
        </FieldError>
      </label>

      <label>
        Type
        <select
          name="event_type_id"
          required
          aria-invalid={Boolean(fieldErrors.event_type_id)}
          aria-describedby={
            fieldErrors.event_type_id ? "event-type-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "event_type_id",
            String(event?.event_type_id ?? ""),
          )}
        >
          <option value="" disabled>
            Select an event type
          </option>

          {eventTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
              {type.available_for_new_events === false ? " (historical)" : ""}
            </option>
          ))}
        </select>
        <FieldError id="event-type-error">
          {fieldErrors.event_type_id}
        </FieldError>
      </label>

      <label>
        Location
        <input
          name="location"
          list="event-location-suggestions"
          required
          aria-invalid={Boolean(fieldErrors.location)}
          aria-describedby={
            fieldErrors.location ? "event-location-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "location",
            event?.location ?? "",
          )}
        />
        <datalist id="event-location-suggestions">
          {locations.map((location) => (
            <option key={location.id} value={location.name} />
          ))}
        </datalist>
        <FieldError id="event-location-error">
          {fieldErrors.location}
        </FieldError>
      </label>

      <label>
        Slides URL (optional)
        <input
          name="slides_url"
          type="url"
          aria-invalid={Boolean(fieldErrors.slides_url)}
          aria-describedby={
            fieldErrors.slides_url ? "event-slides-url-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "slides_url",
            event?.slides_url ?? "",
          )}
        />
        <FieldError id="event-slides-url-error">
          {fieldErrors.slides_url}
        </FieldError>
      </label>

      <label>
        Meeting notes URL (optional)
        <input
          name="meeting_notes_url"
          type="url"
          aria-invalid={Boolean(fieldErrors.meeting_notes_url)}
          aria-describedby={
            fieldErrors.meeting_notes_url
              ? "event-meeting-notes-url-error"
              : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "meeting_notes_url",
            event?.meeting_notes_url ?? "",
          )}
        />
        <FieldError id="event-meeting-notes-url-error">
          {fieldErrors.meeting_notes_url}
        </FieldError>
      </label>

      <label>
        External roster / signup sheet URL (optional)
        <input
          name="signup_sheet_url"
          type="url"
          aria-invalid={Boolean(fieldErrors.signup_sheet_url)}
          aria-describedby={
            fieldErrors.signup_sheet_url
              ? "event-signup-sheet-url-error"
              : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "signup_sheet_url",
            event?.signup_sheet_url ?? "",
          )}
        />
        <span className="block text-sm text-muted">
          External Google Sheet resource. Cappy Hub signups, capacity, waitlist,
          and participation are managed separately.
        </span>
        <FieldError id="event-signup-sheet-url-error">
          {fieldErrors.signup_sheet_url}
        </FieldError>
      </label>

      <label>
        Max volunteers (optional)
        <input
          name="max_volunteers"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          aria-invalid={Boolean(fieldErrors.max_volunteers)}
          aria-describedby={
            fieldErrors.max_volunteers ? "event-capacity-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "max_volunteers",
            event?.max_volunteers?.toString() ?? "",
          )}
        />
        <span className="block text-sm text-muted">
          Leave blank for unlimited confirmed signups.
        </span>
        <FieldError id="event-capacity-error">
          {fieldErrors.max_volunteers}
        </FieldError>
      </label>

      <label className="col-span-2">
        Date (El Paso)
        <input
          name="event_date"
          type="date"
          required
          aria-invalid={Boolean(fieldErrors.event_date)}
          aria-describedby={
            fieldErrors.event_date ? "event-date-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "event_date",
            event?.event_date ?? "",
          )}
        />
        <FieldError id="event-date-error">{fieldErrors.event_date}</FieldError>
      </label>

      <p className="col-span-2">
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
          aria-invalid={Boolean(fieldErrors.start_time)}
          aria-describedby={
            fieldErrors.start_time ? "event-start-time-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "start_time",
            event?.starts_at ? denverParts(event.starts_at).time : "",
          )}
        />
        <FieldError id="event-start-time-error">
          {fieldErrors.start_time}
        </FieldError>
      </label>

      <label>
        End time
        <input
          name="end_time"
          type="time"
          min="06:00"
          max="23:59"
          required
          aria-invalid={Boolean(fieldErrors.end_time)}
          aria-describedby={
            fieldErrors.end_time ? "event-end-time-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "end_time",
            event?.ends_at ? denverParts(event.ends_at).time : "",
          )}
        />
        <FieldError id="event-end-time-error">
          {fieldErrors.end_time}
        </FieldError>
      </label>

      <fieldset
        className="col-span-2"
        aria-invalid={Boolean(fieldErrors.branches)}
        aria-describedby={
          fieldErrors.branches ? "event-branches-error" : undefined
        }
      >
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
        <FieldError id="event-branches-error">
          {fieldErrors.branches}
        </FieldError>
      </fieldset>

      {!event && (
        <RecurrenceFields
          recordType="Event"
          values={state.values}
          fieldErrors={fieldErrors}
          firstDate={submittedValue(state.values, "event_date", "")}
        />
      )}

      <ActionFeedback state={state} />

      <button disabled={pending}>
        {pending
          ? event
            ? "Saving…"
            : "Creating…"
          : event
            ? "Save event"
            : "Create event"}
      </button>
    </form>
  );
}
