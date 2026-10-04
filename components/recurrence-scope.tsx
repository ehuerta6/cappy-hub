"use client";

import { useState } from "react";
import { RecurrenceFields } from "./recurrence-fields";
import { recurrenceFromRule } from "@/lib/recurrence";
import type { FormFieldErrors, FormValues } from "@/lib/form-feedback";

export const recurrenceScopeLabels = {
  occurrence: "This occurrence",
  following: "This and following occurrences",
  series: "All occurrences",
} as const;
export type RecurrenceSeries = {
  id: number;
  revision: number;
  recurrence_rule: string;
  starts_on?: string | null;
};

export function RecurrenceScope({
  series,
  requestKey,
  recordType,
  editing = false,
  selectedKey,
  selectedDate,
  values,
  fieldErrors,
}: {
  series: RecurrenceSeries;
  requestKey: string;
  recordType: "Event" | "Task";
  editing?: boolean;
  selectedKey?: string | null;
  selectedDate?: string;
  values?: FormValues;
  fieldErrors?: FormFieldErrors;
}) {
  const [scope, setScope] = useState("occurrence");
  const [changeRecurrence, setChangeRecurrence] = useState(false);
  return (
    <fieldset className="sm:col-span-2 space-y-3">
      <legend>
        {editing ? "Edit" : "Apply to"} recurring {recordType}
      </legend>
      <input type="hidden" name="recurrence_series_id" value={series.id} />
      <input type="hidden" name="recurrence_revision" value={series.revision} />
      <input type="hidden" name="mutation_request_key" value={requestKey} />
      {editing && (
        <>
          <input
            type="hidden"
            name="recurrence_original_rule"
            value={series.recurrence_rule}
          />
          <input
            type="hidden"
            name="recurrence_original_start"
            value={series.starts_on ?? ""}
          />
        </>
      )}
      {Object.entries(recurrenceScopeLabels).map(([value, label]) => (
        <label key={value} className="flex items-center gap-2">
          <input
            type="radio"
            name="scope"
            value={value}
            checked={scope === value}
            onChange={() => setScope(value)}
          />
          {label}
        </label>
      ))}
      {editing && scope !== "occurrence" && (
        <>
          <p>
            Only changed fields are applied. Each occurrence keeps its own
            workflow history. Removed occurrences stay removed and keep their
            details.
          </p>
          <label>
            <input
              type="checkbox"
              name="change_recurrence"
              checked={changeRecurrence}
              onChange={(event) => setChangeRecurrence(event.target.checked)}
            />{" "}
            Change repeating schedule
          </label>
          {changeRecurrence && (
            <>
              <p>
                The count applies to the selected scope. For all occurrences,
                the date shifts the series by the same number of calendar days.
              </p>
              <RecurrenceFields
                recordType={recordType}
                initial={recurrenceFromRule(series.recurrence_rule)}
                values={values}
                fieldErrors={fieldErrors}
                firstDate={selectedDate ?? ""}
                editPreview={
                  series.starts_on && selectedKey && selectedDate
                    ? {
                        scope: scope === "following" ? "following" : "series",
                        seriesStart: series.starts_on,
                        selectedKey,
                        selectedDate,
                      }
                    : undefined
                }
              />
            </>
          )}
        </>
      )}
    </fieldset>
  );
}

/** Track submitted differences, including changes reverted before submission. */
export function changedFormFields(
  form: HTMLFormElement,
  original: Record<string, string | string[]>,
) {
  const data = new FormData(form);
  return Object.entries(original)
    .filter(([name, value]) => {
      const current = Array.isArray(value)
        ? data.getAll(name).map(String).sort()
        : String(data.get(name) ?? "");
      return (
        JSON.stringify(current) !==
        JSON.stringify(Array.isArray(value) ? [...value].sort() : value)
      );
    })
    .map(([name]) => (name === "branches" ? "branch_ids" : name));
}
