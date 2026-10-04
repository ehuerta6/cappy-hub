"use client";

import { useEffect, useRef, useState } from "react";
import {
  expandRecurrenceDates,
  recurrenceEditStart,
  type RecurrenceEditScope,
  type RecurrenceInput,
} from "@/lib/recurrence";
import {
  submittedValue,
  submittedValues,
  type FormFieldErrors,
  type FormValues,
} from "@/lib/form-feedback";
import { FieldError } from "@/components/ui";

const weekdays = [
  ["MO", "Mon"],
  ["TU", "Tue"],
  ["WE", "Wed"],
  ["TH", "Thu"],
  ["FR", "Fri"],
  ["SA", "Sat"],
  ["SU", "Sun"],
] as const;

export function RecurrenceFields({
  recordType,
  initial,
  values,
  fieldErrors = {},
  firstDate = "",
  editPreview,
}: {
  recordType: "Event" | "Task";
  initial?: RecurrenceInput;
  values?: FormValues;
  fieldErrors?: FormFieldErrors;
  firstDate?: string;
  editPreview?: {
    scope: RecurrenceEditScope;
    seriesStart: string;
    selectedKey: string;
    selectedDate: string;
  };
}) {
  const prefix = recordType.toLowerCase();
  const fieldsRef = useRef<HTMLFieldSetElement>(null);
  const [frequency, setFrequency] = useState(() =>
    submittedValue(
      values,
      "recurrence_frequency",
      initial?.frequency ?? "none",
    ),
  );
  const [endMode, setEndMode] = useState(() =>
    submittedValue(
      values,
      "recurrence_end_mode",
      initial?.until ? "until" : "count",
    ),
  );
  const [interval, setInterval] = useState(() =>
    submittedValue(
      values,
      "recurrence_interval",
      String(initial?.interval ?? 1),
    ),
  );
  const [count, setCount] = useState(() =>
    submittedValue(values, "recurrence_count", String(initial?.count ?? 12)),
  );
  const [until, setUntil] = useState(() =>
    submittedValue(values, "recurrence_until", initial?.until ?? ""),
  );
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>(() =>
    values
      ? submittedValues(values, "recurrence_weekdays")
      : (initial?.weekdays ?? []),
  );
  const [previewDate, setPreviewDate] = useState(firstDate);

  useEffect(() => {
    const form = fieldsRef.current?.closest("form");
    if (!form) return;
    const name = recordType === "Event" ? "event_date" : "due_date";
    const updateDate = () => {
      const input = form.elements.namedItem(name) as HTMLInputElement | null;
      setPreviewDate(input?.value ?? "");
    };
    updateDate();
    form.addEventListener("input", updateDate);
    form.addEventListener("change", updateDate);
    return () => {
      form.removeEventListener("input", updateDate);
      form.removeEventListener("change", updateDate);
    };
  }, [recordType]);

  let previewDates: string[] | null = null;
  if (frequency === "daily" || frequency === "weekly") {
    const recurrence: RecurrenceInput = {
      frequency,
      interval: Number(interval),
      weekdays:
        frequency === "weekly"
          ? (selectedWeekdays as RecurrenceInput["weekdays"])
          : [],
      count: endMode === "count" ? Number(count) : null,
      until: endMode === "until" ? until : null,
    };
    try {
      if (previewDate && (!initial || editPreview)) {
        const startDate = editPreview
          ? recurrenceEditStart({
              ...editPreview,
              editedDate: previewDate,
            })
          : previewDate;
        previewDates = expandRecurrenceDates(
          startDate,
          recurrence,
          Boolean(editPreview),
        );
      }
    } catch {
      // This preview is informational; server validation remains authoritative.
    }
  }

  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));

  return (
    <fieldset ref={fieldsRef} className="sm:col-span-2 space-y-3">
      <legend>Repeat</legend>
      <label>
        Repeat
        <select
          name="recurrence_frequency"
          value={frequency}
          aria-invalid={Boolean(fieldErrors.recurrence_frequency)}
          aria-describedby={
            fieldErrors.recurrence_frequency
              ? `${prefix}-recurrence-frequency-error`
              : undefined
          }
          onChange={(event) => setFrequency(event.target.value)}
        >
          {!initial && <option value="none">Does not repeat</option>}
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <FieldError id={`${prefix}-recurrence-frequency-error`}>
          {fieldErrors.recurrence_frequency}
        </FieldError>
      </label>
      {frequency !== "none" && (
        <>
          <label>
            Repeat every
            <input
              aria-label="Repeat interval"
              name="recurrence_interval"
              type="number"
              aria-invalid={Boolean(fieldErrors.recurrence_interval)}
              aria-describedby={
                fieldErrors.recurrence_interval
                  ? `${prefix}-recurrence-interval-error`
                  : undefined
              }
              min="1"
              max="52"
              step="1"
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
              required
            />
            <span>
              {frequency === "daily" ? "day" : "week"}
              {Number(interval) === 1 ? "" : "s"}
            </span>
            <FieldError id={`${prefix}-recurrence-interval-error`}>
              {fieldErrors.recurrence_interval}
            </FieldError>
          </label>
          {frequency === "weekly" && (
            <fieldset
              aria-invalid={Boolean(fieldErrors.recurrence_weekdays)}
              aria-describedby={
                fieldErrors.recurrence_weekdays
                  ? `${prefix}-recurrence-weekdays-error`
                  : undefined
              }
            >
              <legend>On these weekdays (include the first date)</legend>
              <div className="flex flex-wrap gap-3">
                {weekdays.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      name="recurrence_weekdays"
                      value={value}
                      checked={selectedWeekdays.includes(value)}
                      onChange={(event) =>
                        setSelectedWeekdays((selected) =>
                          event.target.checked
                            ? [...selected, value]
                            : selected.filter((day) => day !== value),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <FieldError id={`${prefix}-recurrence-weekdays-error`}>
                {fieldErrors.recurrence_weekdays}
              </FieldError>
            </fieldset>
          )}
          <label>
            End recurrence by
            <select
              name="recurrence_end_mode"
              value={endMode}
              aria-invalid={Boolean(fieldErrors.recurrence_end_mode)}
              aria-describedby={
                fieldErrors.recurrence_end_mode
                  ? `${prefix}-recurrence-end-mode-error`
                  : undefined
              }
              onChange={(event) => setEndMode(event.target.value)}
            >
              <option value="count">Number of occurrences</option>
              <option value="until">End date</option>
            </select>
            <FieldError id={`${prefix}-recurrence-end-mode-error`}>
              {fieldErrors.recurrence_end_mode}
            </FieldError>
          </label>
          {endMode === "count" ? (
            <label>
              Occurrences (records generated; {initial ? "1" : "2"}–500)
              <input
                name="recurrence_count"
                type="number"
                aria-invalid={Boolean(fieldErrors.recurrence_count)}
                aria-describedby={
                  fieldErrors.recurrence_count
                    ? `${prefix}-recurrence-count-error`
                    : undefined
                }
                min={initial ? 1 : 2}
                max="500"
                step="1"
                value={count}
                onChange={(event) => setCount(event.target.value)}
                required
              />
              <FieldError id={`${prefix}-recurrence-count-error`}>
                {fieldErrors.recurrence_count}
              </FieldError>
            </label>
          ) : (
            <label>
              End date (inclusive)
              <input
                name="recurrence_until"
                type="date"
                aria-invalid={Boolean(fieldErrors.recurrence_until)}
                aria-describedby={
                  fieldErrors.recurrence_until
                    ? `${prefix}-recurrence-until-error`
                    : undefined
                }
                value={until}
                onChange={(event) => setUntil(event.target.value)}
                required
              />
              <FieldError id={`${prefix}-recurrence-until-error`}>
                {fieldErrors.recurrence_until}
              </FieldError>
            </label>
          )}
          <p>
            Occurrences are created as separate records. Each {recordType} keeps
            its own workflow and points. Recurring occurrences support
            individual, following, and whole-series changes.
          </p>
          <section aria-label="Schedule preview" aria-live="polite">
            <p className="font-semibold">Schedule preview</p>
            {previewDates ? (
              <>
                <ol>
                  {previewDates.slice(0, 5).map((date) => (
                    <li key={date}>{dateLabel(date)}</li>
                  ))}
                </ol>
                {previewDates.length > 5 && (
                  <p>Showing the first 5 dates of {previewDates.length}.</p>
                )}
                <p>
                  {previewDates.length}{" "}
                  {previewDates.length === 1 ? "occurrence" : "occurrences"}
                  {" · "}Last occurrence: {dateLabel(previewDates.at(-1)!)}
                </p>
              </>
            ) : (
              <p>
                {initial && !editPreview
                  ? "A schedule preview is unavailable for this edit scope."
                  : "Complete valid recurrence details and choose a first date to preview the schedule."}
              </p>
            )}
          </section>
        </>
      )}
    </fieldset>
  );
}
