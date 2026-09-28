"use client";

import { useActionState } from "react";
import { changeCatalog } from "./catalog-actions";

type Catalog = "position" | "branch" | "event_type";
type Record = { id: number; name: string };

function CatalogForm({
  catalog,
  operation,
  record,
}: {
  catalog: Catalog;
  operation: "create" | "rename" | "delete";
  record?: Record;
}) {
  const [state, action, pending] = useActionState(changeCatalog, {
    error: "",
    success: "",
  });
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
        <input
          id={`${catalog}-${operation}-${record?.id ?? "new"}`}
          name="name"
          required
          defaultValue={operation === "rename" ? record?.name : ""}
          placeholder="Name"
        />
      )}
      <button type="submit" disabled={pending} className="button-secondary">
        {operation === "create"
          ? "Add"
          : operation === "rename"
            ? "Rename"
            : "Delete"}
      </button>
      {state.error && (
        <span role="alert" className="text-red-300">
          {state.error}
        </span>
      )}
      {state.success && <span role="status">{state.success}</span>}
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
  records: Record[];
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
            <li
              key={record.id}
              className="rounded-lg border border-zinc-800 p-3"
            >
              {required ? (
                <p>
                  {record.name}{" "}
                  <span className="text-zinc-400">(required position)</span>
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
