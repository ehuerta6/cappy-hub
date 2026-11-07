"use client";

import { useState } from "react";
import { fieldLabelClassName } from "@/components/ui";
import { submittedValue, submittedValues } from "@/lib/form-feedback";
import type { FormValues } from "@/lib/form-feedback";

type Option = { id: number; name: string };
type ReminderUnit = "minutes" | "hours" | "days";
type ReminderDraft = { amount: string; unit: ReminderUnit };

const reminderUnits: {
  value: ReminderUnit;
  label: string;
  singularLabel: string;
  minutes: number;
}[] = [
  {
    value: "minutes",
    label: "minutes before",
    singularLabel: "minute before",
    minutes: 1,
  },
  {
    value: "hours",
    label: "hours before",
    singularLabel: "hour before",
    minutes: 60,
  },
  {
    value: "days",
    label: "days before",
    singularLabel: "day before",
    minutes: 1440,
  },
];

function reminderDraft(minutes: number): ReminderDraft {
  const unit = [...reminderUnits]
    .reverse()
    .find((option) => minutes % option.minutes === 0);
  return {
    amount: String(minutes / (unit?.minutes ?? 1)),
    unit: unit?.value ?? "minutes",
  };
}

function reminderMinutes(reminder: ReminderDraft) {
  const unit = reminderUnits.find((option) => option.value === reminder.unit);
  return Number(reminder.amount) * (unit?.minutes ?? 1);
}

export default function NotificationSettingsFields({
  branches,
  positions,
  isEvent,
  allActive = false,
  selectedBranchIds = [],
  selectedPositionIds = [],
  reminderOffsets,
  values,
}: {
  branches: Option[];
  positions: Option[];
  isEvent: boolean;
  allActive?: boolean;
  selectedBranchIds?: number[];
  selectedPositionIds?: number[];
  reminderOffsets?: number[];
  values?: FormValues;
}) {
  const defaults = reminderOffsets ?? (isEvent ? [1440, 60] : [1440]);
  const [all, setAll] = useState(
    submittedValue(values, "notification_all_active", allActive ? "on" : "") ===
      "on",
  );
  const submittedBranches = submittedValues(
    values,
    "notification_branches",
    selectedBranchIds.map(String),
  ).map(Number);
  const submittedPositions = submittedValues(
    values,
    "notification_positions",
    selectedPositionIds.map(String),
  ).map(Number);
  const submittedOffsets = submittedValues(
    values,
    "reminder_offsets",
    defaults.map(String),
  );
  const [reminders, setReminders] = useState(() => {
    if (
      submittedOffsets.length === 1 &&
      submittedOffsets[0].trim().length === 0
    )
      return [];
    return submittedOffsets.flatMap((value) =>
      value.split(",").map(Number).map(reminderDraft),
    );
  });
  return (
    <fieldset className="event-form-section col-span-2 notification-settings">
      <legend className="px-1 text-sm font-semibold">Notifications</legend>
      <div className="notification-settings-content">
        <div className="notification-audience">
          <p className="event-form-section-description">
            Choose who receives an in-app notice. This does not sign anyone up,
            assign work, or change Points or Warnings. If you leave the audience
            empty, notices go to the default{" "}
            {isEvent
              ? "Event Branches (or all active Officers for a global Event)"
              : "Task assignees"}
            .
          </p>
          <label className="notification-audience-all">
            <input
              type="checkbox"
              name="notification_all_active"
              checked={all}
              onChange={(event) => setAll(event.currentTarget.checked)}
            />
            All active Officers
          </label>
          <div className="notification-audience-targets">
            <fieldset className="notification-audience-options">
              <legend className={fieldLabelClassName}>Branches</legend>
              {branches.map((branch) => (
                <label key={branch.id}>
                  <input
                    type="checkbox"
                    name="notification_branches"
                    value={branch.id}
                    defaultChecked={submittedBranches.includes(branch.id)}
                  />
                  {branch.name}
                </label>
              ))}
            </fieldset>
            <fieldset className="notification-audience-options">
              <legend className={fieldLabelClassName}>Positions</legend>
              {positions.map((position) => (
                <label key={position.id}>
                  <input
                    type="checkbox"
                    name="notification_positions"
                    value={position.id}
                    defaultChecked={submittedPositions.includes(position.id)}
                  />
                  {position.name}
                </label>
              ))}
            </fieldset>
          </div>
        </div>
        <div className="notification-reminders">
          <div className="notification-reminders-heading">
            <div>
              <h3>{isEvent ? "Event reminders" : "Task reminders"}</h3>
              <p>
                Choose when to notify people before the{" "}
                {isEvent ? "Event starts" : "Task is due"}.
              </p>
            </div>
            <button
              type="button"
              className="button-secondary notification-add-reminder"
              onClick={() =>
                setReminders((current) => [...current, reminderDraft(30)])
              }
              disabled={reminders.length >= 6}
            >
              Add reminder
            </button>
          </div>
          {reminders.length === 0 ? (
            <>
              <p className="notification-no-reminders">
                No reminders scheduled.
              </p>
              <input type="hidden" name="reminder_offsets" value="" />
            </>
          ) : (
            <ul className="notification-reminder-list">
              {reminders.map((reminder, index) => (
                <li key={index} className="notification-reminder-row">
                  <span className="notification-reminder-prefix">
                    Remind me
                  </span>
                  <label>
                    <span className="sr-only">Reminder {index + 1}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max={Math.floor(
                        43200 /
                          (reminderUnits.find(
                            (unit) => unit.value === reminder.unit,
                          )?.minutes ?? 1),
                      )}
                      required
                      value={reminder.amount}
                      onChange={(event) => {
                        const amount = event.currentTarget.value;
                        setReminders((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, amount } : item,
                          ),
                        );
                      }}
                    />
                  </label>
                  <label>
                    <span className="sr-only">Reminder {index + 1} unit</span>
                    <select
                      value={reminder.unit}
                      onChange={(event) => {
                        const unit = event.currentTarget.value as ReminderUnit;
                        setReminders((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, unit } : item,
                          ),
                        );
                      }}
                    >
                      {reminderUnits.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {reminder.amount === "1"
                            ? unit.singularLabel
                            : unit.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    type="hidden"
                    name="reminder_offsets"
                    value={reminderMinutes(reminder)}
                  />
                  <button
                    type="button"
                    className="button-link notification-remove-reminder"
                    aria-label={`Remove reminder ${index + 1}`}
                    onClick={() =>
                      setReminders((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!isEvent && (
            <p className="notification-reminder-note">
              Without a due time, reminders are based on noon local time on the
              due date. The default one-day reminder arrives at noon the day
              before.
            </p>
          )}
        </div>
      </div>
    </fieldset>
  );
}
