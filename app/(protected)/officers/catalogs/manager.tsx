"use client";

import { useActionState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { changeCatalog } from "./actions";

type Catalog = "position" | "branch" | "event_location";
type CatalogRecord = { id: number; name: string };

function CatalogForm({
  catalog,
  operation,
  record,
}: {
  catalog: Catalog;
  operation: "create" | "rename" | "delete";
  record?: CatalogRecord;
}) {
  const [state, action, pending] = useActionState(
    changeCatalog,
    initialFormActionState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  const fieldId = `${catalog}-${operation}-${record?.id ?? "new"}`;
  const errorId = `${fieldId}-error`;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="catalog" value={catalog} />
      <input type="hidden" name="operation" value={operation} />
      {record && <input type="hidden" name="id" value={record.id} />}
      {operation !== "delete" && (
        <label
          className="sr-only"
          htmlFor={`${catalog}-${operation}-${record?.id ?? "new"}`}
        >
          Name
        </label>
      )}
      {operation !== "delete" && (
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
      <button type="submit" disabled={pending} className="button-secondary">
        {pending
          ? operation === "create"
            ? "Adding…"
            : operation === "rename"
              ? "Saving…"
              : "Deleting…"
          : operation === "create"
            ? "Add"
            : operation === "rename"
              ? "Rename"
              : "Delete"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

const requiredPositions = new Set([
  "President",
  "Vice President of Operations",
  "Vice President of Academics",
  "Secretary",
  "Lead",
  "Officer",
]);

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
          const required =
            catalog === "position" && requiredPositions.has(record.name);
          return (
            <li key={record.id} className="rounded-lg border border-border p-3">
              {required ? (
                <p>
                  {record.name}{" "}
                  <span className="text-muted">(required position)</span>
                </p>
              ) : (
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
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
