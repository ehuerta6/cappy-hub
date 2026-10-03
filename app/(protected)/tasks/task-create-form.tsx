"use client";

import { useActionState, useState } from "react";
import type { Tables } from "@/lib/database.types";
import {
  RecurrenceScope,
  changedFormFields,
  type RecurrenceSeries,
} from "@/components/recurrence-scope";
import { createTask, editRecurringTask } from "./actions";
import { RecurrenceFields } from "@/components/recurrence-fields";

export default function TaskCreateForm({
  branches,
  recurrenceRequestKey,
  task,
  series,
}: {
  branches: { id: number; name: string }[];
  recurrenceRequestKey: string;
  task?: Tables<"tasks">;
  series?: RecurrenceSeries;
}) {
  const [state, action, pending] = useActionState(
    task ? editRecurringTask : createTask,
    { error: "" },
  );
  const [editedFields, setEditedFields] = useState<string[]>([]);
  const original: Record<string, string | string[]> = task
    ? {
        title: task.title,
        description: task.description,
        task_type: task.task_type,
        branch_id: String(task.branch_id),
        due_date: task.due_date,
        points: String(task.points),
        approval_required: task.approval_required ? "on" : "",
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
        />
      )}
      <input
        type="hidden"
        name="recurrence_request_key"
        value={recurrenceRequestKey}
      />
      <label>
        Title
        <input name="title" required defaultValue={task?.title} />
      </label>
      <label>
        Description
        <textarea
          name="description"
          required
          defaultValue={task?.description}
        />
      </label>
      <label>
        Type
        <select name="task_type" required defaultValue={task?.task_type ?? ""}>
          <option value="" disabled>
            Select task type
          </option>
          {["Flyer", "LinkedIn", "Airtable", "Story", "Post"].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      <label>
        Branch
        <select name="branch_id" required defaultValue={task?.branch_id ?? ""}>
          <option value="" disabled>
            Select branch
          </option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Due date
        <input
          name="due_date"
          type="date"
          required
          defaultValue={task?.due_date}
        />
      </label>
      <label>
        Points
        <input
          name="points"
          defaultValue={task?.points}
          type="number"
          min="0.01"
          step="0.01"
          required
        />
      </label>
      <label>
        <input
          name="approval_required"
          type="checkbox"
          defaultChecked={task?.approval_required}
        />{" "}
        Require lead approval before points are awarded
      </label>
      {!task && <RecurrenceFields recordType="Task" />}
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      <button disabled={pending}>
        {pending ? "Saving…" : task ? "Save task" : "Create task"}
      </button>
    </form>
  );
}
