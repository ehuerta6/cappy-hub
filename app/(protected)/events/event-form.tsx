"use client";

import { useActionState, useRef, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { denverParts } from "@/lib/event-time";
import {
  initialFormActionState,
  submittedValue,
  submittedValues,
} from "@/lib/form-feedback";
import { ActionFeedback, FieldError } from "@/components/ui";
import { saveEvent } from "./actions";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
import {
  RecurrenceScope,
  changedFormFields,
  type RecurrenceSeries,
} from "@/components/recurrence-scope";
import { RecurrenceFields } from "@/components/recurrence-fields";
import { EventLocationAutocomplete } from "@/components/event-location-autocomplete";
import TimeSlotsEditor, { type TimeSlotDraft } from "./time-slots-editor";
import NotificationSettingsFields from "@/components/notification-settings-fields";
import ResourceLinksEditor from "@/components/resource-links-editor";
import {
  resourceLinksForForm,
  type ResourceLinkView,
} from "@/lib/resource-links";

export default function EventForm({
  returnTo,
  branches,
  positions = [],
  eventTypes,
  locations,
  event,
  branchIds = [],
  allowGlobal = false,
  recurrenceRequestKey,
  series,
  mutationRequestKey,
  timeSlots = [],
  canEnableTimeSlots = true,
  notificationSettings,
  resourceLinks = [],
}: {
  returnTo?: string;
  branches: Pick<Tables<"branches">, "id" | "name">[];
  positions?: Pick<Tables<"positions">, "id" | "name">[];
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
  timeSlots?: TimeSlotDraft[];
  canEnableTimeSlots?: boolean;
  notificationSettings?: {
    allActive: boolean;
    branchIds: number[];
    positionIds: number[];
    reminderOffsets: number[];
  };
  resourceLinks?: ResourceLinkView[];
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
  const restoredLocation = submittedValue(
    state.values,
    "location",
    event?.location ?? "",
  );
  const [locationDraft, setLocationDraft] = useState(() => ({
    source: restoredLocation,
    value: restoredLocation,
  }));
  if (locationDraft.source !== restoredLocation) {
    setLocationDraft({ source: restoredLocation, value: restoredLocation });
  }
  const initialResourceLinks = resourceLinksForForm(resourceLinks);
  const resourceLinksValue = submittedValue(
    state.values,
    "resource_links",
    JSON.stringify(initialResourceLinks),
  );
  const initialStartTime = submittedValue(
    state.values,
    "start_time",
    event?.starts_at ? denverParts(event.starts_at).time : "",
  );
  const initialEndTime = submittedValue(
    state.values,
    "end_time",
    event?.ends_at ? denverParts(event.ends_at).time : "",
  );
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [selectedEventTypeId, setSelectedEventTypeId] = useState(
    submittedValue(
      state.values,
      "event_type_id",
      String(event?.event_type_id ?? ""),
    ),
  );

  const [editedFields, setEditedFields] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const originalTimeSlots = timeSlots.length
    ? JSON.stringify(timeSlots)
    : "null";
  const timeSlotsEnabledInitially =
    submittedValue(state.values, "time_slots", originalTimeSlots) !== "null";
  const [timeSlotsEnabled, setTimeSlotsEnabled] = useState(
    timeSlotsEnabledInitially,
  );
  const original: Record<string, string | string[]> = event
    ? {
        name: event.name,
        description: event.description,
        location: event.location ?? "",
        event_type_id: String(event.event_type_id),
        resource_links: JSON.stringify(initialResourceLinks),
        max_volunteers: event.max_volunteers?.toString() ?? "",
        event_date: event.event_date,
        start_time: denverParts(event.starts_at).time,
        end_time: denverParts(event.ends_at).time,
        branches: branchIds.map(String),
        time_slots: originalTimeSlots,
      }
    : {};
  const updateEditedFields = (
    form: HTMLFormElement,
    overrides: Record<string, string> = {},
  ) => {
    if (!series) return;
    const changedFields = changedFormFields(form, original);
    const changed = new Set(changedFields);
    for (const [name, value] of Object.entries(overrides)) {
      if (value === String(original[name] ?? "")) changed.delete(name);
      else changed.add(name);
    }
    setEditedFields(
      [...new Set([...changedFields, ...Object.keys(overrides)])].filter(
        (name) => changed.has(name),
      ),
    );
  };

  return (
    <form
      ref={formRef}
      action={action}
      className="event-form"
      onChange={(event) => updateEditedFields(event.currentTarget)}
    >
      <AcademicPeriodWriteContextField />
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
      <fieldset className="event-form-section">
        <legend>Event information</legend>
        <div className="event-form-fields">
          <label className="col-span-full">
            Name
            <input
              name="name"
              required
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={
                fieldErrors.name ? "event-name-error" : undefined
              }
              defaultValue={submittedValue(
                state.values,
                "name",
                event?.name ?? "",
              )}
            />
            <FieldError id="event-name-error">{fieldErrors.name}</FieldError>
          </label>

          <label className="col-span-full">
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
              onChange={(changeEvent) =>
                setSelectedEventTypeId(changeEvent.currentTarget.value)
              }
            >
              <option value="" disabled>
                Select an event type
              </option>
              {eventTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                  {type.available_for_new_events === false
                    ? " (historical)"
                    : ""}
                </option>
              ))}
            </select>
            <FieldError id="event-type-error">
              {fieldErrors.event_type_id}
            </FieldError>
          </label>
        </div>
      </fieldset>

      <fieldset className="event-form-section">
        <legend>Schedule and location</legend>
        <div className="event-form-fields">
          <label>
            Location
            <EventLocationAutocomplete
              locations={locations}
              initialValue={restoredLocation}
              value={locationDraft.value}
              onValueChange={(value) => {
                setLocationDraft((current) => ({ ...current, value }));
                if (formRef.current) {
                  updateEditedFields(formRef.current, { location: value });
                }
              }}
              error={fieldErrors.location}
            />
          </label>

          <label>
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
            <FieldError id="event-date-error">
              {fieldErrors.event_date}
            </FieldError>
          </label>

          <p className="col-span-full text-sm text-muted">
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
              aria-invalid={Boolean(fieldErrors.start_time)}
              aria-describedby={
                fieldErrors.start_time ? "event-start-time-error" : undefined
              }
              defaultValue={submittedValue(
                state.values,
                "start_time",
                event?.starts_at ? denverParts(event.starts_at).time : "",
              )}
              onChange={(changeEvent) =>
                setStartTime(changeEvent.currentTarget.value)
              }
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
              onChange={(changeEvent) =>
                setEndTime(changeEvent.currentTarget.value)
              }
            />
            <FieldError id="event-end-time-error">
              {fieldErrors.end_time}
            </FieldError>
          </label>
        </div>
      </fieldset>

      <TimeSlotsEditor
        eventStart={startTime}
        eventEnd={endTime}
        eventTypeName={
          eventTypes.find((type) => String(type.id) === selectedEventTypeId)
            ?.name ?? ""
        }
        initialSlots={timeSlots}
        enabledInitially={timeSlotsEnabledInitially}
        onEnabledChange={setTimeSlotsEnabled}
        activationUnavailableReason={
          canEnableTimeSlots
            ? undefined
            : "Time Slots can only be enabled before any Officers have signed up for this Event. Existing signups and Points are preserved."
        }
        onSlotsChange={(serialized) => {
          if (!series) return;
          setEditedFields((fields) => {
            const next = new Set(fields);
            if (serialized === originalTimeSlots) next.delete("time_slots");
            else next.add("time_slots");
            return [...next];
          });
        }}
      />
      <FieldError id="event-time-slots-error">
        {fieldErrors.time_slots}
      </FieldError>

      <ResourceLinksEditor
        key={resourceLinksValue}
        initialValue={resourceLinksValue}
        error={fieldErrors.resource_links}
        onChange={(value) => {
          if (formRef.current)
            updateEditedFields(formRef.current, { resource_links: value });
        }}
      />

      <fieldset className="event-form-section">
        <legend>Participation and capacity</legend>
        {timeSlotsEnabled ? (
          <p className="text-sm text-muted">
            Set an optional capacity for each Time Slot in the section above.
          </p>
        ) : (
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
            <span className="text-sm text-muted">
              Leave blank for unlimited confirmed signups.
            </span>
            <FieldError id="event-capacity-error">
              {fieldErrors.max_volunteers}
            </FieldError>
          </label>
        )}

        <fieldset
          className="event-form-branches"
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
      </fieldset>

      {series && mutationRequestKey && (
        <div className="event-form-recurrence lg:col-span-2">
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
        </div>
      )}

      {!event && (
        <div className="event-form-recurrence lg:col-span-2">
          <RecurrenceFields
            recordType="Event"
            values={state.values}
            fieldErrors={fieldErrors}
            firstDate={submittedValue(state.values, "event_date", "")}
          />
        </div>
      )}

      <NotificationSettingsFields
        branches={branches}
        positions={positions}
        isEvent
        values={state.values}
        allActive={notificationSettings?.allActive}
        selectedBranchIds={notificationSettings?.branchIds}
        selectedPositionIds={notificationSettings?.positionIds}
        reminderOffsets={notificationSettings?.reminderOffsets}
      />

      <div className="lg:col-span-2">
        <ActionFeedback state={state} />
      </div>

      <button className="lg:col-span-2 w-fit" disabled={pending}>
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
