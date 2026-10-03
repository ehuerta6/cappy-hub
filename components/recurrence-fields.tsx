"use client";

import { useState } from "react";

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
}: {
  recordType: "Event" | "Task";
}) {
  const [frequency, setFrequency] = useState("none");
  const [endMode, setEndMode] = useState("count");
  return (
    <fieldset className="sm:col-span-2 space-y-3">
      <legend>Repeat</legend>
      <label>
        Repeat
        <select
          name="recurrence_frequency"
          value={frequency}
          onChange={(event) => setFrequency(event.target.value)}
        >
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      {frequency !== "none" && (
        <>
          <label>
            Repeat every
            <input
              aria-label="Repeat interval"
              name="recurrence_interval"
              type="number"
              min="1"
              max="52"
              step="1"
              defaultValue="1"
              required
            />
          </label>
          {frequency === "weekly" && (
            <fieldset>
              <legend>On these weekdays (include the first date)</legend>
              <div className="flex flex-wrap gap-3">
                {weekdays.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      name="recurrence_weekdays"
                      value={value}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label>
            End recurrence by
            <select
              name="recurrence_end_mode"
              value={endMode}
              onChange={(event) => setEndMode(event.target.value)}
            >
              <option value="count">Number of occurrences</option>
              <option value="until">End date</option>
            </select>
          </label>
          {endMode === "count" ? (
            <label>
              Occurrences (2–500)
              <input
                name="recurrence_count"
                type="number"
                min="2"
                max="500"
                step="1"
                defaultValue="12"
                required
              />
            </label>
          ) : (
            <label>
              End date (inclusive)
              <input name="recurrence_until" type="date" required />
            </label>
          )}
          <p>
            Occurrences are created as separate records.{" "}
            {recordType === "Event"
              ? "Edits apply to this occurrence only. Editing this and future occurrences or the entire series is not supported. One occurrence can be cancelled or removed."
              : "Each Task has its own assignment, completion, approval and points. Task details cannot be edited in this MVP; unfinished occurrences can be removed individually."}
          </p>
        </>
      )}
    </fieldset>
  );
}
