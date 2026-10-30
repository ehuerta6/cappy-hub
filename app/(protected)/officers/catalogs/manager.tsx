"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { changeCatalog } from "./actions";

type Catalog =
  "position" | "branch" | "event_location" | "event_type" | "task_type";
export type CatalogRecord = {
  id: number;
  name: string;
  code?: string | null;
  is_active?: boolean;
  available_for_new_events?: boolean;
  available_for_new_tasks?: boolean;
};

function CatalogForm({
  catalog,
  operation,
  record,
}: {
  catalog: Catalog;
  operation: "create" | "delete" | "restore";
  record?: CatalogRecord;
}) {
  const [state, action, pending] = useActionState(
    changeCatalog,
    initialFormActionState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  const fieldId = `${catalog}-${operation}-${record?.id ?? "new"}`;
  const errorId = `${fieldId}-error`;
  const catalogName =
    catalog === "event_location"
      ? "Event location"
      : catalog === "branch"
        ? "Branch"
        : catalog === "event_type"
          ? "Event type"
          : catalog === "task_type"
            ? "Task type"
            : "Position";
  const formClassName =
    operation === "create" ? "catalog-create-form" : "catalog-action-form";
  return (
    <form action={action} className={formClassName}>
      <input type="hidden" name="catalog" value={catalog} />
      <input type="hidden" name="operation" value={operation} />
      {record && <input type="hidden" name="id" value={record.id} />}
      {(operation === "delete" || operation === "restore") && record && (
        <input type="hidden" name="name" value={record.name} />
      )}
      {operation === "create" && (
        <label
          className="sr-only"
          htmlFor={`${catalog}-${operation}-${record?.id ?? "new"}`}
        >
          {`New ${catalogName} name`}
        </label>
      )}
      {operation === "create" && (
        <>
          <input
            id={fieldId}
            name="name"
            required
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? errorId : undefined}
            defaultValue={submittedValue(state.values, "name", "")}
            placeholder="Name"
          />
          <FieldError id={errorId}>{fieldErrors.name}</FieldError>
        </>
      )}
      {operation === "delete" && record ? (
        <ConfirmationDialog
          title={`Delete ${catalogName}?`}
          description="This removes the value from new choices. Existing records and relationships stay readable. You can restore it from Deleted values."
          triggerLabel="Delete"
          confirmLabel={`Delete ${catalogName}`}
          destructive
          pending={pending}
          context={{
            label: catalogName,
            fieldName: "name",
            values: {},
            defaultValue: record.name,
          }}
        />
      ) : operation === "restore" ? (
        <button type="submit" disabled={pending} className="button-secondary">
          {pending ? "Restoring…" : "Restore"}
        </button>
      ) : (
        <button type="submit" disabled={pending} className="button-secondary">
          {pending ? "Adding…" : "Add"}
        </button>
      )}
      <ActionFeedback state={state} />
    </form>
  );
}

function CatalogRename({
  catalog,
  record,
}: {
  catalog: Catalog;
  record: CatalogRecord;
}) {
  const [state, action, pending] = useActionState(
    changeCatalog,
    initialFormActionState,
  );
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const previousStateRef = useRef(state);
  const focusRenameButtonRef = useRef(false);
  const fieldId = `${catalog}-rename-${record.id}`;
  const errorId = `${fieldId}-error`;
  const catalogName =
    catalog === "event_location"
      ? "Event location"
      : catalog === "branch"
        ? "Branch"
        : catalog === "event_type"
          ? "Event type"
          : catalog === "task_type"
            ? "Task type"
            : "Position";

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (editing && previousStateRef.current !== state) {
      if (state.success) {
        focusRenameButtonRef.current = true;
        window.setTimeout(() => setEditing(false), 0);
      } else if (state.error) {
        inputRef.current?.focus();
      }
    }
    previousStateRef.current = state;
  }, [editing, state]);

  useEffect(() => {
    if (!editing && focusRenameButtonRef.current) {
      focusRenameButtonRef.current = false;
      renameButtonRef.current?.focus();
    }
  }, [editing]);

  if (!editing) {
    return (
      <div className="catalog-record-name">
        <p className="min-w-0 break-words">{record.name}</p>
        <button
          ref={renameButtonRef}
          type="button"
          className="button-secondary"
          onClick={() => setEditing(true)}
        >
          Rename
        </button>
        {state.success && <ActionFeedback state={state} />}
      </div>
    );
  }

  return (
    <form action={action} className="catalog-rename-form">
      <input type="hidden" name="catalog" value={catalog} />
      <input type="hidden" name="operation" value="rename" />
      <input type="hidden" name="id" value={record.id} />
      <label className="sr-only" htmlFor={fieldId}>
        {catalogName} name for {record.name}
      </label>
      <input
        ref={inputRef}
        id={fieldId}
        name="name"
        required
        aria-invalid={Boolean(state.fieldErrors?.name)}
        aria-describedby={state.fieldErrors?.name ? errorId : undefined}
        defaultValue={submittedValue(state.values, "name", record.name)}
        placeholder="Name"
      />
      <button type="submit" disabled={pending} className="button-secondary">
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        className="button-secondary"
        disabled={pending}
        onClick={() => {
          focusRenameButtonRef.current = true;
          setEditing(false);
        }}
      >
        Cancel
      </button>
      <FieldError id={errorId}>{state.fieldErrors?.name}</FieldError>
      <ActionFeedback state={state} />
    </form>
  );
}

export default function CatalogManager({
  catalog,
  title,
  records,
  showCreate = true,
}: {
  catalog: Catalog;
  title: string;
  records: CatalogRecord[];
  showCreate?: boolean;
}) {
  return (
    <section className="catalog-manager space-y-3">
      <h2 id="catalog-category-heading" className="text-lg font-semibold">
        {title}
      </h2>
      {showCreate && <CatalogForm catalog={catalog} operation="create" />}
      <ul
        className={
          catalog === "position"
            ? "catalog-position-list"
            : "catalog-record-list"
        }
      >
        {records.map((record) => {
          const required = catalog === "position" && record.code != null;
          const deleted =
            record.is_active === false ||
            record.available_for_new_events === false ||
            record.available_for_new_tasks === false;
          return (
            <li key={record.id} className="catalog-record-row">
              {required ? (
                <p>
                  {record.name}{" "}
                  <span className="text-muted">(required position)</span>
                </p>
              ) : (
                <>
                  <CatalogRename catalog={catalog} record={record} />
                  {deleted && (
                    <span className="catalog-record-status">Deleted</span>
                  )}
                  <CatalogForm
                    catalog={catalog}
                    operation={deleted ? "restore" : "delete"}
                    record={record}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
