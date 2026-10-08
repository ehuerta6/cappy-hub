"use client";

import { useActionState, useState } from "react";
import type { Tables } from "@/lib/database.types";
import {
  initialFormActionState,
  submittedValue,
  submittedValues,
} from "@/lib/form-feedback";
import { ActionFeedback, FieldError } from "@/components/ui";
import {
  RecurrenceScope,
  changedFormFields,
  type RecurrenceSeries,
} from "@/components/recurrence-scope";
import { createTask, editRecurringTask, editStandaloneTask } from "./actions";
import { RecurrenceFields } from "@/components/recurrence-fields";
import { TASK_TYPES } from "@/lib/task-types";

export default function TaskCreateForm({
  returnTo,
  branches,
  events = [],
  taskEventIds = [],
  recurrenceRequestKey,
  task,
  series,
}: {
  returnTo?: string;
  branches: { id: number; name: string }[];
  events?: {
    id: number;
    name: string;
    event_date: string;
    status: string;
    deleted_at: string | null;
  }[];
  taskEventIds?: number[];
  recurrenceRequestKey: string;
  task?: Tables<"tasks">;
  series?: RecurrenceSeries;
}) {
  const [state, action, pending] = useActionState(
    task ? (series ? editRecurringTask : editStandaloneTask) : createTask,
    initialFormActionState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  const [editedFields, setEditedFields] = useState<string[]>([]);
  const original: Record<string, string | string[]> = task
    ? {
        title: task.title,
        description: task.description,
        task_type: task.task_type,
        branch_id: String(task.branch_id),
        due_date: task.due_date,
        points: String(task.points),
        event_ids: taskEventIds.map(String),
      }
    : {};
  return (
    <form
      action={action}
      className="space-y-4 max-w-xl"
      onChange={(event) => {
        if (task)
          setEditedFields(changedFormFields(event.currentTarget, original));
      }}
    >
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {task && <input type="hidden" name="task_id" value={task.id} />}
      {series && task && (
        <>
          <input
            type="hidden"
            name="recurrence_original_date"
            value={task.due_date}
          />
          <input
            type="hidden"
            name="recurrence_original_key"
            value={task.recurrence_key ?? ""}
          />
        </>
      )}
      {editedFields.map((field) => (
        <input key={field} type="hidden" name="edited_fields" value={field} />
      ))}
      {series && (
        <RecurrenceScope
          series={series}
          requestKey={recurrenceRequestKey}
          recordType="Task"
          editing
          selectedKey={task?.recurrence_key}
          selectedDate={task?.due_date}
          values={state.values}
          fieldErrors={fieldErrors}
        />
      )}
      <input
        type="hidden"
        name="recurrence_request_key"
        value={recurrenceRequestKey}
      />
      <label>
        Title
        <input
          name="title"
          required
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={fieldErrors.title ? "task-title-error" : undefined}
          defaultValue={submittedValue(
            state.values,
            "title",
            task?.title ?? "",
          )}
        />
        <FieldError id="task-title-error">{fieldErrors.title}</FieldError>
      </label>
      <label>
        Description
        <textarea
          name="description"
          required
          aria-invalid={Boolean(fieldErrors.description)}
          aria-describedby={
            fieldErrors.description ? "task-description-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "description",
            task?.description ?? "",
          )}
        />
        <FieldError id="task-description-error">
          {fieldErrors.description}
        </FieldError>
      </label>
      <label>
        Type
        <select
          name="task_type"
          required
          aria-invalid={Boolean(fieldErrors.task_type)}
          aria-describedby={
            fieldErrors.task_type ? "task-type-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "task_type",
            task?.task_type ?? "",
          )}
        >
          <option value="" disabled>
            Select task type
          </option>
          {TASK_TYPES.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
        <FieldError id="task-type-error">{fieldErrors.task_type}</FieldError>
      </label>
      <label>
        Branch
        <select
          name="branch_id"
          required
          aria-invalid={Boolean(fieldErrors.branch_id)}
          aria-describedby={
            fieldErrors.branch_id ? "task-branch-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "branch_id",
            String(task?.branch_id ?? ""),
          )}
        >
          <option value="" disabled>
            Select branch
          </option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <FieldError id="task-branch-error">{fieldErrors.branch_id}</FieldError>
      </label>
      <label>
        Due date
        <input
          name="due_date"
          type="date"
          required
          aria-invalid={Boolean(fieldErrors.due_date)}
          aria-describedby={
            fieldErrors.due_date ? "task-due-date-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "due_date",
            task?.due_date ?? "",
          )}
        />
        <FieldError id="task-due-date-error">{fieldErrors.due_date}</FieldError>
      </label>
      <label>
        Points
        <input
          name="points"
          type="number"
          min="0"
          step="any"
          required
          aria-invalid={Boolean(fieldErrors.points)}
          aria-describedby={
            fieldErrors.points ? "task-points-error" : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "points",
            task ? String(task.points) : "",
          )}
        />
        <FieldError id="task-points-error">{fieldErrors.points}</FieldError>
      </label>
      <label>
        Linked Events
        <select
          name="event_ids"
          multiple
          size={Math.min(8, Math.max(4, events.length))}
          defaultValue={submittedValues(
            state.values,
            "event_ids",
            taskEventIds.map(String),
          )}
          aria-describedby="task-events-help"
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name} — {event.event_date}
              {event.deleted_at
                ? " (Archived)"
                : event.status === "cancelled"
                  ? " (Cancelled)"
                  : ""}
            </option>
          ))}
        </select>
        <span id="task-events-help" className="text-sm text-muted">
          Optional context links. Event and Task permissions, completion, and
          Points stay separate.
        </span>
        <FieldError id="task-events-error">{fieldErrors.event_ids}</FieldError>
      </label>
      {!task && (
        <RecurrenceFields
          recordType="Task"
          values={state.values}
          fieldErrors={fieldErrors}
          firstDate={submittedValue(state.values, "due_date", "")}
        />
      )}
      <ActionFeedback state={state} />
      <button disabled={pending}>
        {pending
          ? task
            ? "Saving…"
            : "Creating…"
          : task
            ? "Save task"
            : "Create task"}
      </button>
    </form>
  );
}
