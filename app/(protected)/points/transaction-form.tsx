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
import { formatEventFilterOption } from "@/lib/presentation";
import { ActionFeedback, FieldError, FormMessage } from "@/components/ui";
import { addTransaction, searchEvents } from "./actions";

type PointEvent = Pick<Tables<"events">, "id" | "name" | "event_date">;

export function mergeEventSearchResults(
  current: PointEvent[],
  results: PointEvent[],
) {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of results) byId.set(event.id, event);
  return [...byId.values()];
}

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
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border border-border bg-surface p-5 text-foreground backdrop:bg-black/60 sm:p-6"
      >
        <div className="space-y-5">
          <header className="space-y-1.5">
            <h2
              id="add-transaction-title"
              className="text-lg font-semibold tracking-tight"
            >
              Add transaction
            </h2>
            <p
              id="add-transaction-description"
              className="text-sm leading-5 text-secondary"
            >
              Record a manual award or correct an existing Point total.
            </p>
          </header>
          <TransactionFields
            key={formKey}
            officers={officers}
            events={events}
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
  onSuccess,
}: {
  officers: Pick<Tables<"officers">, "id" | "name">[];
  events: PointEvent[];
  onSuccess: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [availableEvents, setAvailableEvents] = useState(events);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [state, action, pending] = useActionState(
    addTransaction,
    initialFormActionState,
  );
  const fieldErrors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.success) onSuccess(state.success);
  }, [onSuccess, state.success]);

  async function searchOlderEvents() {
    setSearching(true);
    setSearchError("");
    try {
      const results = await searchEvents(search);
      setAvailableEvents((current) =>
        mergeEventSearchResults(current, results),
      );
    } catch {
      setSearchError("Could not search events");
    } finally {
      setSearching(false);
    }
  }

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={action}
      data-pending={pending}
      onReset={(event) => event.preventDefault()}
      className="!grid !max-w-none grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2"
    >
      <label className="sm:col-span-1">
        Officer
        <select
          data-initial-focus
          name="officer_id"
          required
          aria-invalid={Boolean(fieldErrors.officer_id)}
          aria-describedby={
            fieldErrors.officer_id ? "transaction-officer-error" : undefined
          }
          defaultValue={submittedValue(state.values, "officer_id")}
          disabled={pending}
        >
          <option value="">Select officer</option>
          {officers.map((officer) => (
            <option key={officer.id} value={officer.id}>
              {officer.name}
            </option>
          ))}
        </select>
        <FieldError id="transaction-officer-error">
          {fieldErrors.officer_id}
        </FieldError>
      </label>
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
      <label>
        Search older events
        <input
          type="search"
          value={search}
          onChange={(change) => setSearch(change.target.value)}
          placeholder="At least two letters"
          disabled={pending}
        />
      </label>
      <button
        type="button"
        className="button-secondary self-end sm:col-span-2 sm:justify-self-start"
        disabled={pending || searching || search.trim().length < 2}
        onClick={searchOlderEvents}
      >
        {searching ? "Searching…" : "Search events"}
      </button>
      {searchError && (
        <div className="sm:col-span-2">
          <FormMessage kind="error">{searchError}</FormMessage>
        </div>
      )}
      <label className="sm:col-span-2">
        Event (optional)
        <select
          name="event_id"
          aria-invalid={Boolean(fieldErrors.event_id)}
          aria-describedby={
            fieldErrors.event_id ? "transaction-event-error" : undefined
          }
          defaultValue={submittedValue(state.values, "event_id")}
          disabled={pending}
        >
          <option value="">No event</option>
          {availableEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {formatEventFilterOption(event.name, event.event_date)}
            </option>
          ))}
        </select>
        <FieldError id="transaction-event-error">
          {fieldErrors.event_id}
        </FieldError>
      </label>
      {(state.error || state.success) && (
        <div className="sm:col-span-2">
          <ActionFeedback state={state} />
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
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
