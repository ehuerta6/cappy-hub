"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  dialogContentClassName,
  dialogDescriptionClassName,
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogSurfaceClassName,
  dialogTitleClassName,
} from "@/components/ui";

export type ConfirmationContext = {
  label: string;
  fieldName: string;
  values: Readonly<Record<string, string>>;
  defaultValue: string;
};

export function confirmationContextValue(
  formData: FormData,
  context: ConfirmationContext,
) {
  const selectedValue = String(formData.get(context.fieldName) ?? "");
  return (
    context.values[selectedValue] ??
    context.values[context.defaultValue] ??
    selectedValue
  );
}

export function focusTriggerWhenReady(
  trigger: Pick<HTMLButtonElement, "disabled" | "focus" | "isConnected"> | null,
  defer: boolean,
) {
  if (defer || !trigger || !trigger.isConnected || trigger.disabled) return;
  trigger.focus();
}

export function ConfirmationDialog({
  title,
  description,
  triggerLabel,
  cancelLabel = "Cancel",
  confirmLabel,
  destructive = false,
  pending = false,
  triggerClassName = "button-secondary",
  confirmName,
  confirmValue,
  context,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  triggerLabel: string;
  cancelLabel?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  triggerClassName?: string;
  confirmName?: string;
  confirmValue?: string;
  context?: ConfirmationContext;
  onConfirm?: () => void;
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmedRef = useRef(false);
  const closesForSubmissionRef = useRef(false);
  const previousPendingRef = useRef(pending);
  const [contextValue, setContextValue] = useState(
    context?.values[context.defaultValue] ?? "",
  );
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const contextId = `${id}-context`;
  const busy = pending;

  useEffect(() => {
    const wasPending = previousPendingRef.current;
    previousPendingRef.current = pending;

    if (pending) {
      if (dialogRef.current?.open) {
        closesForSubmissionRef.current = true;
        dialogRef.current.close();
      }
    } else if (wasPending) {
      confirmedRef.current = false;
      closesForSubmissionRef.current = false;
      focusTriggerWhenReady(triggerRef.current, false);
    }
  }, [pending]);

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open || busy) return;

    if (context) {
      const form = triggerRef.current?.form;
      const formData = form ? new FormData(form) : new FormData();
      setContextValue(confirmationContextValue(formData, context));
    }

    dialog.showModal();
    cancelRef.current?.focus();
  }

  function handleConfirm(event: MouseEvent<HTMLButtonElement>) {
    if (busy || confirmedRef.current) {
      event.preventDefault();
      return;
    }
    confirmedRef.current = true;
    onConfirm?.();
  }

  function handleClose() {
    if (dialogRef.current?.open) return;

    const deferFocus = pending || closesForSubmissionRef.current;
    if (!deferFocus) confirmedRef.current = false;
    focusTriggerWhenReady(triggerRef.current, deferFocus);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        disabled={busy}
        onClick={openDialog}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={
          context ? `${descriptionId} ${contextId}` : descriptionId
        }
        onClose={handleClose}
        className={dialogSurfaceClassName}
      >
        <div className={dialogContentClassName}>
          <div className={dialogHeaderClassName}>
            <h2 id={titleId} className={dialogTitleClassName}>
              {title}
            </h2>
            <p id={descriptionId} className={dialogDescriptionClassName}>
              {description}
            </p>
          </div>
          {context && (
            <dl
              id={contextId}
              className="rounded-md bg-surface-muted px-3 py-2 text-sm"
            >
              <dt className="text-xs font-medium text-muted">
                {context.label}
              </dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {contextValue}
              </dd>
            </dl>
          )}
          {children}
          <div className={dialogFooterClassName}>
            <button
              ref={cancelRef}
              type="button"
              autoFocus
              disabled={pending}
              className="button-secondary min-h-11"
              onClick={() => dialogRef.current?.close()}
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              name={confirmName}
              value={confirmValue}
              disabled={busy}
              className={
                destructive
                  ? "min-h-11 border border-danger-border bg-danger-bg px-3 py-2 text-sm font-medium text-danger hover:border-danger hover:bg-danger-bg hover:text-danger"
                  : "min-h-11"
              }
              onClick={handleConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
