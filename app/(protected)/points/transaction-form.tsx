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
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
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
import { emitToast } from "@/components/toast-region";
import { addTransaction } from "./actions";
import { EventSearchSelect } from "./event-search-select";

type PointEvent = Pick<Tables<"events">, "id" | "name" | "event_date">;
type PointTask = Pick<Tables<"tasks">, "id" | "title" | "due_date">;

const POINT_PRESETS = ["1", "2", "-1"] as const;

export default function TransactionForm({
  officers,
  events,
  tasks = [],
  defaultOfficerId,
  compact = false,
}: {
  officers: Pick<Tables<"officers">, "id" | "name">[];
  events: PointEvent[];
  tasks?: PointTask[];
  defaultOfficerId?: number;
  compact?: boolean;
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
      emitToast(message, "success");
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
        className={
          compact ? "button-secondary min-h-9 px-3 py-1.5 text-xs" : "min-h-11"
        }
        onClick={() => {
          setSuccess("");
          setOpen(true);
        }}
      >
        Add adjustment
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
              Add Point adjustment
            </h2>
            <p
              id="add-transaction-description"
              className={dialogDescriptionClassName}
            >
              Enter an amount and reason. A Negative Point is exactly -1 and may
              link to one Event or Task. Automatic awards remain separate.
            </p>
          </header>
          <TransactionFields
            key={formKey}
            officers={officers}
            events={events}
            tasks={tasks}
            defaultOfficerId={defaultOfficerId}
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
  tasks,
  defaultOfficerId,
  dialogRef,
  onSuccess,
}: {
  officers: Pick<Tables<"officers">, "id" | "name">[];
  events: PointEvent[];
  tasks: PointTask[];
  defaultOfficerId?: number;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    addTransaction,
    initialFormActionState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  const pointsInput = useRef<HTMLInputElement>(null);
  const initialAwardType = submittedValue(state.values, "award_type", "manual");
  const [awardType, setAwardType] = useState(initialAwardType);
  const [selectedEventId, setSelectedEventId] = useState(() =>
    submittedValue(state.values, "event_id"),
  );
  const [selectedTaskId, setSelectedTaskId] = useState(() =>
    submittedValue(state.values, "task_id"),
  );
  const isNegative = awardType === "negative";

  useEffect(() => {
    if (!pointsInput.current) return;
    if (isNegative) pointsInput.current.value = "-1";
    pointsInput.current.readOnly = isNegative;
  }, [isNegative]);

  useEffect(() => {
    if (state.success) onSuccess(state.success);
  }, [onSuccess, state.success]);

  const applyPreset = (value: string) => {
    if (!pointsInput.current || isNegative) return;
    pointsInput.current.value = value;
    pointsInput.current.dispatchEvent(new Event("input", { bubbles: true }));
    pointsInput.current.focus();
  };

  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={action}
      data-pending={pending}
      onReset={(event) => event.preventDefault()}
      className="!grid !max-w-none grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2"
    >
      <AcademicPeriodWriteContextField />
      <SearchableSelect
        name="officer_id"
        label="Officer"
        options={officers.map((officer) => ({
          id: String(officer.id),
          label: officer.name,
        }))}
        initialValue={submittedValue(
          state.values,
          "officer_id",
          defaultOfficerId ? String(defaultOfficerId) : "",
        )}
        required
        error={fieldErrors.officer_id}
        disabled={pending}
        placeholder="Search Officers"
        portalContainer={dialogRef}
        initialFocus={!defaultOfficerId}
      />
      <label>
        <span className="flex items-center justify-between gap-2">
          <span>Signed Points</span>
          <span className="inline-flex items-center gap-1">
            {POINT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={pending || isNegative}
                onClick={() => applyPreset(preset)}
                className="min-h-6 rounded border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium tabular-nums text-secondary hover:border-border-strong hover:bg-hover hover:text-foreground disabled:opacity-40"
              >
                {Number(preset) > 0 ? `+${preset}` : preset}
              </button>
            ))}
          </span>
        </span>
        <input
          name="points"
          ref={pointsInput}
          type="number"
          step="any"
          inputMode="decimal"
          required
          data-initial-focus={defaultOfficerId ? "" : undefined}
          aria-invalid={Boolean(fieldErrors.points)}
          aria-describedby={
            fieldErrors.points
              ? "transaction-points-hint transaction-points-error"
              : "transaction-points-hint"
          }
          defaultValue={submittedValue(state.values, "points")}
          disabled={pending}
        />
        <FieldError id="transaction-points-error">
          {fieldErrors.points}
        </FieldError>
        <span id="transaction-points-hint" className="text-sm text-muted">
          Positive adds Points; negative deducts them.
        </span>
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
          defaultValue={awardType}
          disabled={pending}
          onChange={(event) => {
            const nextType = event.target.value;
            setAwardType(nextType);
            if (pointsInput.current) {
              const nextNegative = nextType === "negative";
              if (nextNegative) pointsInput.current.value = "-1";
              pointsInput.current.readOnly = nextNegative;
            }
          }}
        >
          <option value="manual">Manual</option>
          <option value="correction">Correction</option>
          <option value="negative">Negative Point (-1)</option>
        </select>
        <FieldError id="transaction-award-type-error">
          {fieldErrors.award_type}
        </FieldError>
      </label>
      <EventSearchSelect
        events={events}
        initialValue={submittedValue(state.values, "event_id")}
        error={fieldErrors.event_id}
        disabled={pending || Boolean(selectedTaskId)}
        portalContainer={dialogRef}
        onValueChange={setSelectedEventId}
      />
      <div className="min-w-0 space-y-1 sm:col-span-2">
        <SearchableSelect
          name="task_id"
          label="Task (optional)"
          options={tasks.map((task) => ({
            id: String(task.id),
            label: `${task.title} — ${task.due_date}`,
          }))}
          initialValue={submittedValue(state.values, "task_id")}
          error={fieldErrors.task_id}
          disabled={pending || Boolean(selectedEventId)}
          placeholder="Search Tasks"
          portalContainer={dialogRef}
          onValueChange={setSelectedTaskId}
        />
        {(selectedEventId || selectedTaskId) && (
          <p className="text-xs text-muted">
            {selectedEventId
              ? "Clear Event above to link a Task instead."
              : "Clear Task to link an Event instead."}
          </p>
        )}
      </div>
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
          {pending ? "Saving…" : "Save adjustment"}
        </button>
      </div>
    </form>
  );
}
