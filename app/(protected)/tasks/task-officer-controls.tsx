"use client";

import { useActionState, useState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValues } from "@/lib/form-feedback";
import {
  bulkAssignTaskOfficers,
  removeTaskAssignment,
  setTaskAssignmentCompletion,
} from "./actions";

export function BulkTaskOfficersForm({
  taskId,
  officers,
}: {
  taskId: number;
  officers: { id: number; name: string }[];
}) {
  const [state, action, pending] = useActionState(
    bulkAssignTaskOfficers,
    initialFormActionState,
  );
  const selectedOfficers = submittedValues(state.values, "officer_ids");
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="task_id" value={taskId} />
      <fieldset
        aria-invalid={Boolean(fieldErrors.officer_ids)}
        aria-describedby={
          fieldErrors.officer_ids ? "task-officers-error" : undefined
        }
      >
        <legend>Select active officers to add</legend>
        {officers.length ? (
          <div className="mt-2 grid gap-2 grid-cols-2">
            {officers.map((officer) => (
              <label key={officer.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="officer_ids"
                  value={officer.id}
                  defaultChecked={selectedOfficers.includes(String(officer.id))}
                />
                {officer.name}
              </label>
            ))}
          </div>
        ) : (
          <p>No active officers are available to add.</p>
        )}
        <FieldError id="task-officers-error">
          {fieldErrors.officer_ids}
        </FieldError>
      </fieldset>
      <ActionFeedback state={state} />
      <button disabled={pending || officers.length === 0}>
        {pending ? "Adding…" : "Add selected officers"}
      </button>
    </form>
  );
}

export function TaskCompletionControl({
  taskId,
  officerId,
  officerName,
  completed,
}: {
  taskId: number;
  officerId: number;
  officerName: string;
  completed: boolean;
}) {
  const [state, action, pending] = useActionState(
    setTaskAssignmentCompletion,
    initialFormActionState,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <span>{completed ? "Completed" : "Not completed"}</span>
      <TaskCompletionCheckbox
        key={String(completed)}
        completed={completed}
        officerName={officerName}
      />
      <button className="button-secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function TaskCompletionCheckbox({
  completed,
  officerName,
}: {
  completed: boolean;
  officerName: string;
}) {
  const [checked, setChecked] = useState(completed);
  return (
    <>
      <input type="hidden" name="completed" value={String(checked)} />
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          aria-label={`Completed for ${officerName}`}
          checked={checked}
          onChange={(event) => setChecked(event.currentTarget.checked)}
        />
        Completed
      </label>
    </>
  );
}

export function RemoveTaskAssignmentForm({
  taskId,
  officerId,
  officerName,
}: {
  taskId: number;
  officerId: number;
  officerName: string;
}) {
  const [state, action, pending] = useActionState(
    removeTaskAssignment,
    initialFormActionState,
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <ActionFeedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="button-secondary whitespace-nowrap"
        aria-label={`Remove ${officerName} from task`}
      >
        {pending ? "Removing…" : "Remove assignment"}
      </button>
    </form>
  );
}
