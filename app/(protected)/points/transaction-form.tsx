"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Tables } from "@/lib/database.types";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
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
import { SearchableSelect } from "@/components/searchable-select";
import { addTransaction } from "./actions";
import { EventSearchSelect } from "./event-search-select";

type PointEvent = Pick<Tables<"events">, "id" | "name" | "event_date">;

export default function TransactionForm({
  officers,
  events,
}: {
  officers: Pick<Tables<"officers">, "id" | "name">[];
  events: PointEvent[];
}) {
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
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        ref={triggerRef}
        type="button"
        className="min-h-11"
        onClick={() => {
          setSuccess("");
          setOpen(true);
        }}
      >
        Add transaction
      </button>
      {success && <FormMessage kind="success">{success}</FormMessage>}
      <dialog
        ref={dialogRef}
        aria-labelledby="add-transaction-title"
        aria-describedby="add-transaction-description"
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
            <h2 id="add-transaction-title" className={dialogTitleClassName}>
              Add transaction
            </h2>
            <p
              id="add-transaction-description"
              className={dialogDescriptionClassName}
            >
              Add or deduct Points with a reason. An optional Event link keeps
              context; automatic participation Points remain separate.
            </p>
          </header>
          <TransactionFields
            key={formKey}
            officers={officers}
            events={events}
            dialogRef={dialogRef}
            onSuccess={handleSuccess}
          />
        </div>
      </dialog>
    </div>
  );
}

function TransactionFields({
  officers,
  events,
  dialogRef,
  onSuccess,
}: {
  officers: Pick<Tables<"officers">, "id" | "name">[];
  events: PointEvent[];
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    addTransaction,
    initialFormActionState,
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
      onReset={(event) => event.preventDefault()}
      className="!grid !max-w-none grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2"
    >
      <SearchableSelect
        name="officer_id"
        label="Officer"
        options={officers.map((officer) => ({
          id: String(officer.id),
          label: officer.name,
        }))}
        initialValue={submittedValue(state.values, "officer_id")}
        required
        error={fieldErrors.officer_id}
        disabled={pending}
        placeholder="Search Officers"
        portalContainer={dialogRef}
        initialFocus
      />
      <label>
        Points
        <input
          name="points"
          type="number"
          step="any"
          required
          aria-invalid={Boolean(fieldErrors.points)}
          aria-describedby={
            fieldErrors.points ? "transaction-points-error" : undefined
          }
          defaultValue={submittedValue(state.values, "points")}
          disabled={pending}
        />
        <FieldError id="transaction-points-error">
          {fieldErrors.points}
        </FieldError>
      </label>
      <label className="sm:col-span-2">
        Reason
        <input
          name="reason"
          required
          aria-invalid={Boolean(fieldErrors.reason)}
          aria-describedby={
            fieldErrors.reason ? "transaction-reason-error" : undefined
          }
          defaultValue={submittedValue(state.values, "reason")}
          disabled={pending}
        />
        <FieldError id="transaction-reason-error">
          {fieldErrors.reason}
        </FieldError>
      </label>
      <label>
        Award type
        <select
          name="award_type"
          aria-invalid={Boolean(fieldErrors.award_type)}
          aria-describedby={
            fieldErrors.award_type ? "transaction-award-type-error" : undefined
          }
          defaultValue={submittedValue(state.values, "award_type", "manual")}
          disabled={pending}
        >
          <option value="manual">Manual</option>
          <option value="correction">Correction</option>
        </select>
        <FieldError id="transaction-award-type-error">
          {fieldErrors.award_type}
        </FieldError>
      </label>
      <EventSearchSelect
        events={events}
        initialValue={submittedValue(state.values, "event_id")}
        error={fieldErrors.event_id}
        disabled={pending}
        portalContainer={dialogRef}
      />
      {(state.error || state.success) && (
        <div className="sm:col-span-2">
          <ActionFeedback state={state} />
        </div>
      )}
      <div className={`${dialogFooterClassName} sm:col-span-2`}>
        <button
          type="button"
          className="button-secondary"
          disabled={pending}
          onClick={(event) => event.currentTarget.closest("dialog")?.close()}
        >
          Cancel
        </button>
        <button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add transaction"}
        </button>
      </div>
    </form>
  );
}
