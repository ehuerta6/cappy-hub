"use client";

import { useActionState, useRef, useState } from "react";
import type { Tables } from "@/lib/database.types";
import {
  initialFormActionState,
  submittedValue,
  submittedValues,
} from "@/lib/form-feedback";
import {
  ActionFeedback,
  FieldError,
  fieldLabelClassName,
} from "@/components/ui";
import {
  RecurrenceScope,
  changedFormFields,
  type RecurrenceSeries,
} from "@/components/recurrence-scope";
import { createTask, editRecurringTask, editStandaloneTask } from "./actions";
import { RecurrenceFields } from "@/components/recurrence-fields";
import { TaskEventCombobox } from "@/components/task-event-combobox";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
import NotificationSettingsFields from "@/components/notification-settings-fields";
import ResourceLinksEditor from "@/components/resource-links-editor";
import {
  resourceLinksForForm,
  type ResourceLinkView,
} from "@/lib/resource-links";

export default function TaskCreateForm({
  returnTo,
  branches,
  positions = [],
  taskTypes = [],
  events = [],
  taskEventIds = [],
  recurrenceRequestKey,
  task,
  series,
  notificationSettings,
  resourceLinks = [],
}: {
  returnTo?: string;
  branches: { id: number; name: string }[];
  positions?: { id: number; name: string }[];
  taskTypes?: { name: string }[];
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
  notificationSettings?: {
    allActive: boolean;
    branchIds: number[];
    positionIds: number[];
    reminderOffsets: number[];
  };
  resourceLinks?: ResourceLinkView[];
}) {
  const [state, action, pending] = useActionState(
    task ? (series ? editRecurringTask : editStandaloneTask) : createTask,
    initialFormActionState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  const [editedFields, setEditedFields] = useState<string[]>([]);
  const initialEventIds = submittedValues(
    state.values,
    "event_ids",
    taskEventIds.map(String),
  );
  const selectedEventIds = useRef(initialEventIds);
  const initialResourceLinks = resourceLinksForForm(resourceLinks);
  const resourceLinksValue = submittedValue(
    state.values,
    "resource_links",
    JSON.stringify(initialResourceLinks),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const original: Record<string, string | string[]> = task
    ? {
        title: task.title,
        description: task.description,
        task_type: task.task_type,
        branch_id: String(task.branch_id),
        due_date: task.due_date,
        points: String(task.points),
        event_ids: taskEventIds.map(String),
        resource_links: JSON.stringify(initialResourceLinks),
      }
    : {};

  function updateEditedFields(resourceValue?: string) {
    if (!task || !formRef.current) return;
    const changed = changedFormFields(formRef.current, original).filter(
      (field) => field !== "event_ids" && field !== "resource_links",
    );
    if (
      resourceValue !== undefined &&
      resourceValue !== original.resource_links
    )
      changed.push("resource_links");
    const originalEventIds = [...(original.event_ids as string[])].sort();
    if (
      JSON.stringify([...selectedEventIds.current].sort()) !==
      JSON.stringify(originalEventIds)
    ) {
      changed.push("event_ids");
    }
    setEditedFields(changed);
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="event-form task-form"
      onChange={() => updateEditedFields()}
    >
      <AcademicPeriodWriteContextField />
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
        <div className="col-span-2">
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
        </div>
      )}
      <input
        type="hidden"
        name="recurrence_request_key"
        value={recurrenceRequestKey}
      />
      <fieldset className="event-form-section">
        <legend>Task details</legend>
        <div className="event-form-fields">
          <label
            className={`task-form-title col-span-full self-start ${fieldLabelClassName}`}
          >
            Title
            <input
              name="title"
              required
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={
                fieldErrors.title ? "task-title-error" : undefined
              }
              defaultValue={submittedValue(
                state.values,
                "title",
                task?.title ?? "",
              )}
            />
            <FieldError id="task-title-error">{fieldErrors.title}</FieldError>
          </label>
          <label
            className={`task-form-description col-span-full self-start ${fieldLabelClassName}`}
          >
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
          <label className={fieldLabelClassName}>
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
              {task &&
                !taskTypes.some((type) => type.name === task.task_type) && (
                  <option value={task.task_type}>
                    {task.task_type} (Deleted)
                  </option>
                )}
              {taskTypes.map(({ name }) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <FieldError id="task-type-error">
              {fieldErrors.task_type}
            </FieldError>
          </label>
        </div>
      </fieldset>
      <fieldset className="event-form-section">
        <legend>Schedule and ownership</legend>
        <div className="event-form-fields">
          <label className={fieldLabelClassName}>
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
            <FieldError id="task-branch-error">
              {fieldErrors.branch_id}
            </FieldError>
          </label>
          <label className={fieldLabelClassName}>
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
            <FieldError id="task-due-date-error">
              {fieldErrors.due_date}
            </FieldError>
          </label>
          <label className={fieldLabelClassName}>
            Due time (optional)
            <input
              name="due_time"
              type="time"
              defaultValue={submittedValue(
                state.values,
                "due_time",
                task?.due_time?.slice(0, 5) ?? "",
              )}
            />
          </label>
          <label className={fieldLabelClassName}>
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
          <TaskEventCombobox
            events={events}
            initialSelectedIds={initialEventIds}
            error={fieldErrors.event_ids}
            onSelectionChange={(ids) => {
              selectedEventIds.current = ids;
              updateEditedFields();
            }}
          />
        </div>
      </fieldset>
      <ResourceLinksEditor
        key={resourceLinksValue}
        initialValue={resourceLinksValue}
        error={fieldErrors.resource_links}
        onChange={(value) => updateEditedFields(value)}
      />
      {!task && (
        <div className="col-span-2">
          <RecurrenceFields
            recordType="Task"
            values={state.values}
            fieldErrors={fieldErrors}
            firstDate={submittedValue(state.values, "due_date", "")}
          />
        </div>
      )}
      <NotificationSettingsFields
        branches={branches}
        positions={positions}
        isEvent={false}
        values={state.values}
        allActive={notificationSettings?.allActive}
        selectedBranchIds={notificationSettings?.branchIds}
        selectedPositionIds={notificationSettings?.positionIds}
        reminderOffsets={notificationSettings?.reminderOffsets}
      />
      <div className="col-span-2 flex flex-wrap items-start gap-4">
        {(state.error || state.success) && <ActionFeedback state={state} />}
        <button disabled={pending}>
          {pending
            ? task
              ? "Saving…"
              : "Creating…"
            : task
              ? "Save task"
              : "Create task"}
        </button>
      </div>
    </form>
  );
}
