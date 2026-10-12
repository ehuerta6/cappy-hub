"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ActionFeedback, FieldError, FormMessage } from "@/components/ui";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    bulkAssignTaskOfficers,
    initialFormActionState,
  );
  const selectedOfficers = submittedValues(state.values, "officer_ids");
  const fieldErrors = state.fieldErrors ?? {};

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("input[type=checkbox]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!state.success) return;
    dialogRef.current?.close();
  }, [state]);

  return (
    <div className="space-y-2">
      {officers.length ? (
        <>
          <button
            ref={triggerRef}
            type="button"
            className="button-secondary min-h-11"
            onClick={() => setOpen(true)}
          >
            Add officers
          </button>
          {state.success && (
            <FormMessage kind="success">{state.success}</FormMessage>
          )}
          <dialog
            ref={dialogRef}
            aria-labelledby="task-officers-title"
            aria-describedby="task-officers-description"
            onClose={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
            onCancel={(event) => {
              if (pending) event.preventDefault();
            }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground backdrop:bg-black/60 sm:p-6"
          >
            <form action={action} className="space-y-4">
              <input type="hidden" name="task_id" value={taskId} />
              <header className="space-y-1.5">
                <h2 id="task-officers-title" className="text-lg font-semibold">
                  Add officers to this task
                </h2>
                <p
                  id="task-officers-description"
                  className="text-sm text-secondary"
                >
                  Choose one or more active officers. Each officer keeps an
                  individual completion state.
                </p>
              </header>
              <fieldset
                aria-invalid={Boolean(fieldErrors.officer_ids)}
                aria-describedby={
                  fieldErrors.officer_ids ? "task-officers-error" : undefined
                }
                disabled={pending}
              >
                <legend>Select active officers</legend>
                <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {officers.map((officer) => (
                    <label
                      key={officer.id}
                      className="flex min-h-11 items-center gap-2 rounded px-2 hover:bg-surface-muted"
                    >
                      <input
                        type="checkbox"
                        name="officer_ids"
                        value={officer.id}
                        defaultChecked={selectedOfficers.includes(
                          String(officer.id),
                        )}
                      />
                      {officer.name}
                    </label>
                  ))}
                </div>
                <FieldError id="task-officers-error">
                  {fieldErrors.officer_ids}
                </FieldError>
              </fieldset>
              {state.error && <ActionFeedback state={state} />}
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  className="button-secondary min-h-11"
                  disabled={pending}
                  onClick={() => dialogRef.current?.close()}
                >
                  Cancel
                </button>
                <button type="submit" className="min-h-11" disabled={pending}>
                  {pending ? "Adding…" : "Add selected officers"}
                </button>
              </div>
            </form>
          </dialog>
        </>
      ) : (
        <p className="text-sm text-muted">All active officers are assigned.</p>
      )}
    </div>
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
  const [checked, setChecked] = useState(completed);
  const changed = checked !== completed;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <input type="hidden" name="completed" value={String(checked)} />
      <span>{checked ? "Completed" : "Not completed"}</span>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          aria-label={`Completed for ${officerName}`}
          checked={checked}
          disabled={pending}
          onChange={(event) => setChecked(event.currentTarget.checked)}
        />
        <span className="sr-only">Completed</span>
      </label>
      {changed && (
        <button className="button-secondary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      )}
      {(state.error || (state.success && !changed)) && (
        <ActionFeedback state={state} />
      )}
    </form>
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
