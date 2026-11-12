"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  resourceLinkKinds,
  resourceLinkLabel,
  type ResourceLinkDraft,
} from "@/lib/resource-links";

const kindNames: Record<(typeof resourceLinkKinds)[number], string> = {
  slides: "Slides",
  meeting_notes: "Meeting notes",
  signup_sheet: "Signup sheet",
  documentation: "Documentation",
  custom: "Other",
};

type ResourceLinkRow = ResourceLinkDraft & { rowId: string };
type FocusTarget = string | "add" | null;

function parseRows(initialValue: string): ResourceLinkRow[] {
  try {
    const value: unknown = JSON.parse(initialValue);
    if (!Array.isArray(value)) return [];
    return (value as ResourceLinkDraft[]).map((resource, index) => ({
      ...resource,
      rowId: `initial-${index}`,
    }));
  } catch {
    return [];
  }
}

function serializedRows(rows: ResourceLinkRow[]) {
  return JSON.stringify(
    rows.map(({ kind, label, url, legacy_key }) => ({
      kind,
      label,
      url,
      legacy_key,
    })),
  );
}

export default function ResourceLinksEditor({
  initialValue,
  error,
  onChange,
}: {
  initialValue: string;
  error?: string;
  onChange?: (value: string) => void;
}) {
  const [rows, setRows] = useState<ResourceLinkRow[]>(() =>
    parseRows(initialValue),
  );
  const nextRowId = useRef(0);
  const selectRefs = useRef(new Map<string, HTMLSelectElement>());
  const labelRefs = useRef(new Map<string, HTMLInputElement>());
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const focusAfterRender = useRef<FocusTarget>(null);
  const previousError = useRef<string | undefined>(undefined);
  const errorId = "resource-links-error";

  useLayoutEffect(() => {
    const target = focusAfterRender.current;
    if (target === "add") addButtonRef.current?.focus();
    else if (target) {
      const focusTarget = target.startsWith("new-")
        ? (labelRefs.current.get(target) ?? selectRefs.current.get(target))
        : (selectRefs.current.get(target) ?? labelRefs.current.get(target));
      focusTarget?.focus();
    } else if (error && error !== previousError.current) {
      errorRef.current?.focus();
    }
    focusAfterRender.current = null;
    previousError.current = error;
  }, [error, rows]);

  function update(next: ResourceLinkRow[]) {
    setRows(next);
    onChange?.(serializedRows(next));
  }

  function change(rowId: string, patch: Partial<ResourceLinkDraft>) {
    update(
      rows.map((resource) => {
        if (resource.rowId !== rowId) return resource;
        const next = { ...resource, ...patch };
        if (patch.kind) {
          next.label = resourceLinkLabel(patch.kind);
          next.legacy_key =
            patch.kind === "slides" ||
            patch.kind === "meeting_notes" ||
            patch.kind === "signup_sheet"
              ? resource.legacy_key === patch.kind
                ? patch.kind
                : null
              : null;
        }
        return next;
      }),
    );
  }

  function addRow() {
    const rowId = `new-${nextRowId.current++}`;
    focusAfterRender.current = rowId;
    update([
      ...rows,
      { rowId, kind: "custom", label: "", url: "", legacy_key: null },
    ]);
  }

  function removeRow(rowId: string) {
    const index = rows.findIndex((row) => row.rowId === rowId);
    const next = rows.filter((row) => row.rowId !== rowId);
    focusAfterRender.current =
      next[index]?.rowId ?? next[index - 1]?.rowId ?? "add";
    update(next);
  }

  return (
    <fieldset
      className="event-form-section event-form-resources col-span-full"
      aria-describedby={
        error ? `resource-links-help ${errorId}` : "resource-links-help"
      }
    >
      <legend>Resource links</legend>
      <p id="resource-links-help" className="event-form-section-description">
        Add optional links for this Event or Task. Each link needs a label and
        an HTTP or HTTPS URL.
      </p>
      <input type="hidden" name="resource_links" value={serializedRows(rows)} />
      {error && (
        <p
          ref={errorRef}
          id={errorId}
          role="alert"
          tabIndex={-1}
          className="text-sm text-danger"
        >
          {error}
        </p>
      )}
      <div className="space-y-3">
        {rows.map((resource, index) => (
          <div
            className="grid items-end gap-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(14rem,2fr)_auto]"
            key={resource.rowId}
          >
            <label className="grid min-w-0 gap-1 text-sm font-medium text-secondary">
              Link type
              <select
                ref={(element) => {
                  if (element) selectRefs.current.set(resource.rowId, element);
                  else selectRefs.current.delete(resource.rowId);
                }}
                aria-label={`Link ${index + 1} type`}
                value={resource.kind}
                onChange={(event) =>
                  change(resource.rowId, {
                    kind: event.currentTarget
                      .value as ResourceLinkDraft["kind"],
                  })
                }
              >
                {resourceLinkKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kindNames[kind]}
                  </option>
                ))}
              </select>
            </label>
            {resource.kind === "custom" ? (
              <label className="grid min-w-0 gap-1 text-sm font-medium text-secondary">
                Link label
                <input
                  ref={(element) => {
                    if (element) labelRefs.current.set(resource.rowId, element);
                    else labelRefs.current.delete(resource.rowId);
                  }}
                  aria-label={`Link ${index + 1} label`}
                  maxLength={80}
                  required
                  value={resource.label}
                  onChange={(event) =>
                    change(resource.rowId, { label: event.currentTarget.value })
                  }
                />
              </label>
            ) : (
              <div className="text-sm text-muted sm:pb-3">{resource.label}</div>
            )}
            <label className="grid min-w-0 gap-1 text-sm font-medium text-secondary sm:col-start-2 sm:row-start-2">
              URL
              <input
                aria-label={`Link ${index + 1} URL`}
                type="url"
                inputMode="url"
                required
                value={resource.url}
                onChange={(event) =>
                  change(resource.rowId, { url: event.currentTarget.value })
                }
              />
            </label>
            <button
              className="button-secondary min-h-11 sm:col-start-3 sm:row-span-2 sm:row-start-1"
              type="button"
              aria-label={`Remove link ${index + 1}`}
              onClick={() => removeRow(resource.rowId)}
            >
              Remove link
            </button>
          </div>
        ))}
      </div>
      <button
        ref={addButtonRef}
        className="button-secondary mt-3 min-h-11"
        type="button"
        onClick={addRow}
      >
        Add link
      </button>
      {rows.some((resource) => resource.kind === "signup_sheet") && (
        <p className="mt-2 text-sm text-muted">
          Signup sheet links are external resources. Cappy Hub signups,
          capacity, and participation remain separate.
        </p>
      )}
    </fieldset>
  );
}
