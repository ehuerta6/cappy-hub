"use client";

import { useState } from "react";
import type { RecurrenceInput } from "@/lib/recurrence";
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
}: {
  recordType: "Event" | "Task";
  initial?: RecurrenceInput;
  values?: FormValues;
  fieldErrors?: FormFieldErrors;
}) {
  const prefix = recordType.toLowerCase();
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
  return (
    <fieldset className="sm:col-span-2 space-y-3">
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
              defaultValue={submittedValue(
                values,
                "recurrence_interval",
                String(initial?.interval ?? 1),
              )}
              required
            />
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
                      defaultChecked={
                        values
                          ? submittedValues(
                              values,
                              "recurrence_weekdays",
                            ).includes(value)
                          : initial?.weekdays.includes(value)
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
              Occurrences ({initial ? "1" : "2"}–500)
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
                defaultValue={submittedValue(
                  values,
                  "recurrence_count",
                  String(initial?.count ?? 12),
                )}
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
                defaultValue={submittedValue(
                  values,
                  "recurrence_until",
                  initial?.until ?? "",
                )}
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
        </>
      )}
    </fieldset>
  );
}
