"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ActionFeedback,
  dialogContentClassName,
  dialogDescriptionClassName,
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogSurfaceClassName,
  dialogTitleClassName,
  FieldError,
  FormMessage,
} from "@/components/ui";
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

  useEffect(() => {
    if (state.success && officers.length === 0) {
      triggerRef.current
        ?.closest<HTMLElement>('[aria-label="Officers"]')
        ?.focus();
    }
  }, [officers.length, state.success]);

  return (
    <div className="space-y-2">
      <button
        ref={triggerRef}
        type="button"
        className="button-secondary min-h-11"
        disabled={officers.length === 0}
        onClick={() => setOpen(true)}
      >
        Add officers
      </button>
      {state.success && (
        <FormMessage kind="success">{state.success}</FormMessage>
      )}
      {officers.length === 0 && (
        <p className="text-sm text-muted">
          No active officers are available to add.
        </p>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby="task-officers-title"
        aria-describedby="task-officers-description"
        onClose={() => {
          setOpen(false);
          if (!triggerRef.current?.disabled) triggerRef.current?.focus();
          else
            triggerRef.current
              ?.closest<HTMLElement>('[aria-label="Officers"]')
              ?.focus();
        }}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        className={dialogSurfaceClassName}
      >
        <form action={action} className={dialogContentClassName}>
          <input type="hidden" name="task_id" value={taskId} />
          <header className={dialogHeaderClassName}>
            <h2 id="task-officers-title" className={dialogTitleClassName}>
              Add officers to this task
            </h2>
            <p
              id="task-officers-description"
              className={dialogDescriptionClassName}
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
          <div className={dialogFooterClassName}>
            <button
              type="button"
              className="button-secondary min-h-11"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-11"
              disabled={pending || officers.length === 0}
            >
              {pending ? "Adding…" : "Add selected officers"}
            </button>
          </div>
        </form>
      </dialog>
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
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
