"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ActionFeedback, FieldError, FormMessage } from "@/components/ui";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { createWarning, decideWarning, voidWarning } from "./warning-actions";

const initial = initialFormActionState;

export function CreateWarningForm({ officerId }: { officerId: number }) {
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
        Create warning
      </button>
      {success && <FormMessage kind="success">{success}</FormMessage>}
      <dialog
        ref={dialogRef}
        aria-labelledby="create-warning-title"
        aria-describedby="create-warning-description"
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          if (
            dialogRef.current?.querySelector("form")?.dataset.pending === "true"
          )
            event.preventDefault();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground backdrop:bg-black/60 sm:p-6"
      >
        <div className="space-y-5">
          <header className="space-y-1.5">
            <h2
              id="create-warning-title"
              className="text-lg font-semibold tracking-tight"
            >
              Create warning
            </h2>
            <p
              id="create-warning-description"
              className="text-sm leading-5 text-secondary"
            >
              The reason is permanent. A new warning starts pending and requires
              approval from the current President and Vice Presidents.
            </p>
          </header>
          <CreateWarningFields
            key={formKey}
            officerId={officerId}
            onSuccess={handleSuccess}
          />
        </div>
      </dialog>
    </div>
  );
}

function CreateWarningFields({
  officerId,
  onSuccess,
}: {
  officerId: number;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(createWarning, initial);
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
            fieldErrors.reason ? "warning-reason-error" : undefined
          }
          defaultValue={submittedValue(state.values, "reason")}
        />
        <FieldError id="warning-reason-error">{fieldErrors.reason}</FieldError>
      </label>
      {state.error && <ActionFeedback state={state} />}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          className="button-secondary"
          disabled={pending}
          onClick={(event) => event.currentTarget.closest("dialog")?.close()}
        >
          Cancel
        </button>
        <button disabled={pending}>
          {pending ? "Creating…" : "Create warning"}
        </button>
      </div>
    </form>
  );
}

export function WarningDecisionForm({ warningId }: { warningId: number }) {
  const [state, action, pending] = useActionState(decideWarning, initial);
  const [pendingDecision, setPendingDecision] = useState<
    "approved" | "rejected" | null
  >(null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="warning_id" value={warningId} />
      <ConfirmationDialog
        title="Approve warning?"
        description="This records your approval for the warning under the existing leadership approval rules."
        triggerLabel={
          pending && pendingDecision === "approved" ? "Approving…" : "Approve"
        }
        confirmLabel="Approve"
        pending={pending}
        triggerClassName=""
        confirmName="decision"
        confirmValue="approved"
        onConfirm={() => setPendingDecision("approved")}
      />
      <ConfirmationDialog
        title="Reject warning?"
        description="This records your rejection for the warning under the existing leadership decision rules."
        triggerLabel={
          pending && pendingDecision === "rejected" ? "Rejecting…" : "Reject"
        }
        confirmLabel="Reject"
        destructive
        pending={pending}
        triggerClassName=""
        confirmName="decision"
        confirmValue="rejected"
        onConfirm={() => setPendingDecision("rejected")}
      />
      <ActionFeedback state={state} />
    </form>
  );
}

export function VoidWarningForm({
  warningId,
  officerId,
}: {
  warningId: number;
  officerId: number;
}) {
  const [state, action, pending] = useActionState(voidWarning, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="warning_id" value={warningId} />
      <input type="hidden" name="officer_id" value={officerId} />
      <ConfirmationDialog
        title="Void warning?"
        description="This keeps the warning and its approval history, removes it from active warning totals, and cannot be undone."
        triggerLabel={pending ? "Voiding…" : "Void"}
        confirmLabel="Void warning"
        destructive
        pending={pending}
        triggerClassName="button-secondary"
      />
      <ActionFeedback state={state} />
    </form>
  );
}
