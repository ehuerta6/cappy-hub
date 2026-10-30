"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
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

export function CreateWarningForm({ officerId }: { officerId: number }) {
  return <WarningForm officerId={officerId} />;
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
}: {
  officerId: number;
  warning?: { id: number; reason: string };
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
      setFormKey((key) => key + 1);
      setOpen(false);
      router.refresh();
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
                ? "Corrections are recorded in the System Log. Historical status and approval history are preserved."
                : "This warning takes effect immediately. Admins can correct its reason later, with a record in the System Log."}
            </p>
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
      <input type="hidden" name="officer_id" value={officerId} />
      {warning && <input type="hidden" name="warning_id" value={warning.id} />}
      <label>
        Reason
        <textarea
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
        <button disabled={pending}>
          {pending ? "Saving…" : warning ? "Save changes" : "Create warning"}
        </button>
      </div>
    </form>
  );
}

export function DeleteWarningForm({
  warningId,
  officerId,
}: {
  warningId: number;
  officerId: number;
}) {
  const [state, action, pending] = useActionState(deleteWarning, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="warning_id" value={warningId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <ConfirmationDialog
        title="Delete warning?"
        description="This removes the warning from active totals. Its status and approval history are preserved, and an Admin can restore it later."
        triggerLabel={pending ? "Deleting…" : "Delete"}
        confirmLabel="Delete warning"
        destructive
        pending={pending}
        triggerClassName="button-secondary"
      />
      <ActionFeedback state={state} />
    </form>
  );
}

export function RestoreWarningForm({
  warningId,
  officerId,
}: {
  warningId: number;
  officerId: number;
}) {
  const [state, action, pending] = useActionState(restoreWarning, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="warning_id" value={warningId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <ConfirmationDialog
        title="Restore warning?"
        description="This returns the warning to its previous status. Rejected and pending Warnings remain inactive."
        triggerLabel={pending ? "Restoring…" : "Restore"}
        confirmLabel="Restore warning"
        pending={pending}
        triggerClassName="button-secondary"
      />
      <ActionFeedback state={state} />
    </form>
  );
}
