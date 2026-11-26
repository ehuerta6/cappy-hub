"use client";

import {
  useCallback,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
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
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
import { SearchableOfficerChecklist } from "@/components/officer-checklist-filter";
import { emitToast } from "@/components/toast-region";
import { initialFormActionState, submittedValues } from "@/lib/form-feedback";
import {
  approveAllPendingTaskCompletions,
  bulkAssignTaskOfficers,
  removeTaskAssignment,
  setTaskAssignmentCompletion,
} from "./actions";

export function BulkTaskOfficersForm({
  taskId,
  officers,
}: {
  taskId: number;
  officers: { id: number; name: string; branches?: string[] }[];
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emptyStateRef = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    bulkAssignTaskOfficers,
    initialFormActionState,
  );
  const selectedOfficers = submittedValues(state.values, "officer_ids");
  const fieldErrors = state.fieldErrors ?? {};
  const restoreFocus = useCallback(() => {
    if (triggerRef.current && !triggerRef.current.disabled) {
      triggerRef.current.focus();
      return;
    }
    emptyStateRef.current?.focus();
  }, []);

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
    emitToast(state.success, "success");
    dialogRef.current?.close();
  }, [state]);

  useEffect(() => {
    if (state.success && officers.length === 0) {
      restoreFocus();
    }
  }, [officers.length, restoreFocus, state.success]);

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
        <p
          ref={emptyStateRef}
          role="status"
          tabIndex={-1}
          className="text-sm text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          No active officers are available to add.
        </p>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby="task-officers-title"
        aria-describedby="task-officers-description"
        onClose={() => {
          setOpen(false);
          restoreFocus();
        }}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        className={dialogSurfaceClassName}
      >
        <form
          action={action}
          onReset={(event) => event.preventDefault()}
          className={dialogContentClassName}
        >
          <AcademicPeriodWriteContextField />
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
            <div className="mt-2">
              <SearchableOfficerChecklist
                key={state.success || "idle"}
                officers={officers}
                initialSelectedIds={selectedOfficers.map(Number)}
                disabled={pending}
              />
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
  pendingApproval = false,
}: {
  taskId: number;
  officerId: number;
  officerName: string;
  completed: boolean;
  pendingApproval?: boolean;
}) {
  const [state, action, pending] = useActionState(
    setTaskAssignmentCompletion,
    initialFormActionState,
  );
  const [requestedCompletion, setRequestedCompletion] = useState(completed);
  const checked = pending ? requestedCompletion : completed;

  return (
    <form className="w-auto max-w-none space-y-1">
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <fieldset
        disabled={pending}
        aria-label={`Completion for ${officerName}`}
        className="inline-flex flex-nowrap gap-1.5 border-0 p-0"
      >
        {([false, true] as const).map((value) => {
          const isSelected = !pendingApproval && checked === value;
          return (
            <label
              key={String(value)}
              className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${
                isSelected
                  ? value
                    ? "border-success-border bg-success-bg text-success"
                    : "border-border-strong bg-surface-muted text-foreground"
                  : pendingApproval && value
                    ? "border-success-border/70 bg-success-bg/40 text-success hover:bg-success-bg"
                    : "border-border bg-surface text-muted hover:bg-hover hover:text-foreground"
              }`}
            >
              <input
                type="radio"
                name="completed"
                value={String(value)}
                checked={isSelected}
                onChange={(event) => {
                  if (pending || !event.currentTarget.form) return;
                  setRequestedCompletion(value);
                  const formData = new FormData(event.currentTarget.form);
                  startTransition(() => action(formData));
                }}
              />
              {value ? "Completed" : "Not completed"}
            </label>
          );
        })}
      </fieldset>
      {pendingApproval && (
        <p className="text-sm text-muted">
          Reported completion awaiting review. Choose a state to decide it.
        </p>
      )}
      {pending && (
        <p role="status" className="text-sm text-muted">
          Saving…
        </p>
      )}
      {!pending && <ActionFeedback state={state} />}
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
    <form action={action} className="w-auto max-w-none space-y-1">
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <ActionFeedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="button-secondary button-danger whitespace-nowrap"
        aria-label={`Remove ${officerName} from task`}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
    </form>
  );
}

export function ApproveAllPendingButton({
  taskId,
  officerIds,
}: {
  taskId: number;
  officerIds: number[];
}) {
  const [state, action, pending] = useActionState(
    approveAllPendingTaskCompletions,
    initialFormActionState,
  );
  useEffect(() => {
    if (state.success) emitToast(state.success, "success");
  }, [state.success]);
  if (officerIds.length === 0) return null;
  return (
    <form action={action} className="w-auto max-w-none">
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="task_id" value={taskId} />
      {officerIds.map((id) => (
        <input key={id} type="hidden" name="officer_ids" value={id} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className="button-primary !min-h-8 whitespace-nowrap px-3 py-1 text-xs"
      >
        {pending
          ? "Approving…"
          : officerIds.length === 1
            ? "Approve pending (1)"
            : `Approve all pending (${officerIds.length})`}
      </button>
      {state.error && <ActionFeedback state={state} />}
    </form>
  );
}
