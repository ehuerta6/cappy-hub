"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
import { emitToast } from "@/components/toast-region";
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
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import {
  createWarning,
  deleteWarning,
  restoreWarning,
  updateWarning,
} from "./warning-actions";

const initial = initialFormActionState;

const WARNING_REASON_PRESETS = [
  "Missed event shift without notice",
  "Missed task deadline",
  "Unexcused meeting absence",
  "Late event cancellation",
] as const;

export function CreateWarningForm({
  officerId,
  approvedWarningCount,
}: {
  officerId: number;
  approvedWarningCount?: number;
}) {
  return (
    <WarningForm
      officerId={officerId}
      approvedWarningCount={approvedWarningCount}
    />
  );
}

export function EditWarningForm({
  officerId,
  warningId,
  reason,
}: {
  officerId: number;
  warningId: number;
  reason: string;
}) {
  return (
    <WarningForm officerId={officerId} warning={{ id: warningId, reason }} />
  );
}

function WarningForm({
  officerId,
  warning,
  approvedWarningCount,
}: {
  officerId: number;
  warning?: { id: number; reason: string };
  approvedWarningCount?: number;
}) {
  const title = warning ? "Edit warning" : "Create warning";
  const formId = warning ? `edit-warning-${warning.id}` : "create-warning";
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wasOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() =>
        dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus(),
      );
    } else if (!open && dialog.open) {
      dialog.close();
    }
    if (!open && wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const handleSuccess = useCallback(
    (message: string) => {
      setSuccess(message);
      emitToast(message, "success");
      setFormKey((key) => key + 1);
      setOpen(false);
      startTransition(() => router.refresh());
    },
    [router],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        ref={triggerRef}
        type="button"
        className="button-secondary min-h-11"
        onClick={() => {
          setSuccess("");
          setOpen(true);
        }}
      >
        {title}
      </button>
      {success && <FormMessage kind="success">{success}</FormMessage>}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${formId}-title`}
        aria-describedby={`${formId}-description`}
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          if (
            dialogRef.current?.querySelector("form")?.dataset.pending === "true"
          )
            event.preventDefault();
        }}
        className={dialogSurfaceClassName}
      >
        <div className={dialogContentClassName}>
          <header className={dialogHeaderClassName}>
            <h2 id={`${formId}-title`} className={dialogTitleClassName}>
              {title}
            </h2>
            <p
              id={`${formId}-description`}
              className={dialogDescriptionClassName}
            >
              {warning
                ? "Corrections are recorded in the audit history. Historical status and approval history are preserved."
                : "This warning takes effect immediately. Admins can correct its reason later, with a record in the audit history."}
            </p>
            {!warning && approvedWarningCount !== undefined && (
              <p
                className={`mt-2 rounded-md border px-3 py-2 text-xs font-medium ${
                  approvedWarningCount >= 2
                    ? "border-warning-border bg-warning-bg text-warning"
                    : "border-border bg-surface-muted text-secondary"
                }`}
              >
                Currently {approvedWarningCount} approved warning
                {approvedWarningCount === 1 ? "" : "s"}
                {approvedWarningCount === 2
                  ? " — adding this warning will reach the 3-warning Admin Review threshold."
                  : approvedWarningCount >= 3
                    ? " — already at or above the 3-warning Admin Review threshold."
                    : "."}
              </p>
            )}
          </header>
          <WarningFields
            key={formKey}
            officerId={officerId}
            onSuccess={handleSuccess}
            warning={warning}
            formId={formId}
          />
        </div>
      </dialog>
    </div>
  );
}

function WarningFields({
  officerId,
  onSuccess,
  warning,
  formId,
}: {
  officerId: number;
  onSuccess: (message: string) => void;
  warning?: { id: number; reason: string };
  formId: string;
}) {
  const [state, action, pending] = useActionState(
    warning ? updateWarning : createWarning,
    initial,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fieldErrors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.success) onSuccess(state.success);
  }, [onSuccess, state.success]);

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={action}
      data-pending={pending}
      className="space-y-3"
      onReset={(event) => event.preventDefault()}
    >
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="officer_id" value={officerId} />
      {warning && <input type="hidden" name="warning_id" value={warning.id} />}
      {!warning && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Common warning reasons"
        >
          {WARNING_REASON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={pending}
              onClick={() => {
                if (textareaRef.current) {
                  textareaRef.current.value = preset;
                  textareaRef.current.focus();
                }
              }}
              className="!min-h-7 rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-secondary hover:border-brand-border hover:bg-brand-bg hover:text-brand"
            >
              {preset}
            </button>
          ))}
        </div>
      )}
      <label>
        Reason
        <textarea
          ref={textareaRef}
          data-initial-focus
          name="reason"
          required
          rows={3}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.reason)}
          aria-describedby={
            fieldErrors.reason ? `${formId}-reason-error` : undefined
          }
          defaultValue={submittedValue(
            state.values,
            "reason",
            warning?.reason ?? "",
          )}
        />
        <FieldError id={`${formId}-reason-error`}>
          {fieldErrors.reason}
        </FieldError>
      </label>
      {state.error && <ActionFeedback state={state} />}
      <div className={dialogFooterClassName}>
        <button
          type="button"
          className="button-secondary"
          disabled={pending}
          onClick={(event) => event.currentTarget.closest("dialog")?.close()}
        >
          Cancel
        </button>
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : warning ? "Save changes" : "Create warning"}
        </button>
      </div>
    </form>
  );
}

export function DeleteWarningForm({
  warningId,
  officerId,
  origin = "manual",
}: {
  warningId: number;
  officerId: number;
  origin?: "manual" | "automatic";
}) {
  const [state, action, pending] = useActionState(deleteWarning, initial);
  useEffect(() => {
    if (state.success) emitToast(state.success, "success");
  }, [state.success]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="warning_id" value={warningId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <ConfirmationDialog
        title="Delete warning?"
        description={
          origin === "automatic"
            ? "This removes the Warning and its three linked negative Points from active totals. An Admin can restore the linked Points and Warning later if the group has not changed."
            : "This removes the Warning from active totals without changing Point history. Its status and approval history are preserved, and an Admin can restore it later."
        }
        triggerLabel={pending ? "Deleting…" : "Delete"}
        confirmLabel="Delete warning"
        destructive
        pending={pending}
        triggerClassName="button-secondary button-danger"
      />
      <ActionFeedback state={state} />
    </form>
  );
}

export function RestoreWarningForm({
  warningId,
  officerId,
  origin = "manual",
}: {
  warningId: number;
  officerId: number;
  origin?: "manual" | "automatic";
}) {
  const [state, action, pending] = useActionState(restoreWarning, initial);
  useEffect(() => {
    if (state.success) emitToast(state.success, "success");
  }, [state.success]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="warning_id" value={warningId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <ConfirmationDialog
        title="Restore warning?"
        description={
          origin === "automatic"
            ? "This restores the Warning and its three linked negative Points. Restore is unavailable if those Points now belong to another Warning."
            : "This returns the Warning to its previous status. Rejected and pending Warnings remain inactive."
        }
        triggerLabel={pending ? "Restoring…" : "Restore"}
        confirmLabel="Restore warning"
        pending={pending}
        triggerClassName="button-secondary"
      />
      <ActionFeedback state={state} />
    </form>
  );
}
