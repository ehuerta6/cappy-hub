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
  const formClassName =
    operation === "create"
      ? "catalog-create-form"
      : operation === "rename"
        ? "catalog-rename-form"
        : "catalog-action-form";
  return (
    <form action={action} className={formClassName}>
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
          {operation === "create"
            ? `New ${catalogName} name`
            : `${catalogName} name for ${record?.name ?? "record"}`}
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
    <section className="catalog-manager space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <CatalogForm catalog={catalog} operation="create" />
      <ul
        className={
          catalog === "position"
            ? "catalog-position-list"
            : "catalog-record-list"
        }
      >
        {records.map((record) => {
          const required = catalog === "position" && record.code != null;
          const supportsLifecycle =
            catalog === "branch" || (catalog === "position" && !required);
          return (
            <li key={record.id} className="catalog-record-row">
              {required ? (
                <p>
                  {record.name}{" "}
                  <span className="text-muted">(required position)</span>
                </p>
              ) : (
                <>
                  <CatalogForm
                    catalog={catalog}
                    operation="rename"
                    record={record}
                  />
                  {record.is_active === false && (
                    <span className="catalog-record-status">Retired</span>
                  )}
                  <CatalogForm
                    catalog={catalog}
                    operation="delete"
                    record={record}
                  />
                  {supportsLifecycle && (
                    <CatalogForm
                      catalog={catalog}
                      operation={
                        record.is_active === false ? "reactivate" : "retire"
                      }
                      record={record}
                    />
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
