"use client";

import { useActionState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { changeCatalog } from "./actions";

type Catalog = "position" | "branch" | "event_location";
type CatalogRecord = {
  id: number;
  name: string;
  code?: string | null;
  is_active?: boolean;
};

function CatalogForm({
  catalog,
  operation,
  record,
}: {
  catalog: Catalog;
  operation: "create" | "rename" | "delete" | "retire" | "reactivate";
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
        : "Position";
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="catalog" value={catalog} />
      <input type="hidden" name="operation" value={operation} />
      {record && <input type="hidden" name="id" value={record.id} />}
      {(operation === "delete" ||
        operation === "retire" ||
        operation === "reactivate") &&
        record && <input type="hidden" name="name" value={record.name} />}
      {(operation === "create" || operation === "rename") && (
        <label
          className="sr-only"
          htmlFor={`${catalog}-${operation}-${record?.id ?? "new"}`}
        >
          Name
        </label>
      )}
      {(operation === "create" || operation === "rename") && (
        <>
          <input
            id={fieldId}
            name="name"
            required
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? errorId : undefined}
            defaultValue={submittedValue(
              state.values,
              "name",
              operation === "rename" ? (record?.name ?? "") : "",
            )}
            placeholder="Name"
          />
          <FieldError id={errorId}>{fieldErrors.name}</FieldError>
        </>
      )}
      {operation === "delete" && record ? (
        <ConfirmationDialog
          title={`Delete ${catalogName}?`}
          description={
            catalog === "position"
              ? "This removes the Position from available Officer choices. A Position in use cannot be deleted."
              : catalog === "branch"
                ? "This removes the Branch from available choices. Branches used by Officers, Events, or Tasks cannot be deleted."
                : "This removes the saved location from future choices. Existing Events keep their recorded location."
          }
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
      ) : operation === "retire" || operation === "reactivate" ? (
        <button type="submit" disabled={pending} className="button-secondary">
          {pending
            ? "Saving…"
            : operation === "retire"
              ? "Retire"
              : "Reactivate"}
        </button>
      ) : (
        <button type="submit" disabled={pending} className="button-secondary">
          {pending
            ? operation === "create"
              ? "Adding…"
              : "Saving…"
            : operation === "create"
              ? "Add"
              : "Rename"}
        </button>
      )}
      <ActionFeedback state={state} />
    </form>
  );
}

export default function CatalogManager({
  catalog,
  title,
  records,
}: {
  catalog: Catalog;
  title: string;
  records: CatalogRecord[];
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <CatalogForm catalog={catalog} operation="create" />
      <ul className="space-y-3">
        {records.map((record) => {
          const required = catalog === "position" && record.code != null;
          return (
            <li key={record.id} className="rounded-lg border border-border p-3">
              {required ? (
                <p>
                  {record.name}{" "}
                  <span className="text-muted">(required position)</span>
                </p>
              ) : (
                <>
                  {record.is_active === false && (
                    <p className="mb-2 text-sm text-muted">Retired</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <CatalogForm
                      catalog={catalog}
                      operation="rename"
                      record={record}
                    />
                    <CatalogForm
                      catalog={catalog}
                      operation="delete"
                      record={record}
                    />
                    <CatalogForm
                      catalog={catalog}
                      operation={
                        record.is_active === false ? "reactivate" : "retire"
                      }
                      record={record}
                    />
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
