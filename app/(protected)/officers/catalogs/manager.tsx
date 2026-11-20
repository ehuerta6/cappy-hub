"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  ActionFeedback,
  CatalogValueBadge,
  FieldError,
  SectionHeading,
} from "@/components/ui";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { changeCatalog } from "./actions";

const DEFAULT_CATALOG_COLOR = "#64748b";
const CATALOG_COLOR_PRESETS = [
  ["Slate", "#64748b"],
  ["Blue", "#2563eb"],
  ["Teal", "#0f766e"],
  ["Green", "#15803d"],
  ["Amber", "#b45309"],
  ["Rose", "#be123c"],
  ["Violet", "#7e22ce"],
] as const;

const isHexColor = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);

type Catalog =
  "position" | "branch" | "event_location" | "event_type" | "task_type";
export type CatalogRecord = {
  id: number;
  name: string;
  code?: string | null;
  is_active?: boolean;
  available_for_new_events?: boolean;
  available_for_new_tasks?: boolean;
  color?: string;
};

function CatalogColorPicker({
  id,
  initialColor,
  error,
  previewLabel = "Sample",
  align = "end",
}: {
  id: string;
  initialColor: string;
  error?: string;
  previewLabel?: string;
  align?: "start" | "end";
}) {
  const fallbackColor = isHexColor(initialColor)
    ? initialColor
    : DEFAULT_CATALOG_COLOR;
  const [color, setColor] = useState(initialColor);
  const previewColor = isHexColor(color) ? color : fallbackColor;
  const [red, green, blue] = hexToRgb(previewColor);
  const pickerRef = useRef<HTMLDetailsElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<"top" | "bottom">("top");
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        pickerRef.current?.open &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        pickerRef.current.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && pickerRef.current?.open) {
        pickerRef.current.open = false;
        pickerRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  const choosePlacement = () => {
    window.requestAnimationFrame(() => {
      const picker = pickerRef.current;
      const trigger = picker?.querySelector("summary")?.getBoundingClientRect();
      const popoverHeight = popoverRef.current?.offsetHeight ?? 0;
      if (!picker?.open || !trigger) return;
      const spaceAbove = trigger.top;
      const spaceBelow = window.innerHeight - trigger.bottom;
      setPlacement(
        spaceAbove >= popoverHeight + 12 || spaceAbove >= spaceBelow
          ? "top"
          : "bottom",
      );
    });
  };
  return (
    <details
      ref={pickerRef}
      className={`catalog-color-picker catalog-color-picker--${align}`}
      data-placement={placement}
    >
      <summary
        aria-label={`Change color, currently ${previewColor}`}
        onClick={choosePlacement}
      >
        <span
          className="catalog-color-current-swatch"
          style={{ backgroundColor: previewColor }}
          aria-hidden="true"
        />
        <span>{previewColor.toUpperCase()}</span>
      </summary>
      <div ref={popoverRef} className="catalog-color-popover">
        <div className="catalog-color-popover-heading">
          <span>Choose a color</span>
          <CatalogValueBadge color={previewColor}>
            {previewLabel}
          </CatalogValueBadge>
        </div>
        <div
          className="catalog-color-presets"
          role="group"
          aria-label="Preset colors"
        >
          {CATALOG_COLOR_PRESETS.map(([label, value]) => (
            <button
              key={value}
              type="button"
              className="catalog-color-preset"
              aria-label={`${label}, ${value}`}
              aria-pressed={color.toLowerCase() === value.toLowerCase()}
              title={`${label} (${value})`}
              style={{ backgroundColor: value }}
              onClick={() => setColor(value)}
            />
          ))}
          <label className="catalog-color-native-picker" title="Custom color">
            <input
              id={`${id}-custom`}
              type="color"
              value={previewColor}
              onChange={(event) => setColor(event.target.value)}
              aria-label="Choose custom color"
            />
          </label>
        </div>
        <div className="catalog-color-inputs">
          <label className="catalog-color-hex-field" htmlFor={`${id}-hex`}>
            HEX
            <input
              id={`${id}-hex`}
              name="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              pattern="#[0-9A-Fa-f]{6}"
              maxLength={7}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              title="Enter a 6-digit HEX color, such as #2563eb"
            />
          </label>
          <div
            className="catalog-color-rgb-fields"
            role="group"
            aria-label="RGB values"
          >
            {([red, green, blue] as const).map((channel, index) => (
              <label key={index}>
                {(["R", "G", "B"] as const)[index]}
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={channel}
                  onChange={(event) => {
                    const channels = [red, green, blue];
                    channels[index] = Math.max(
                      0,
                      Math.min(255, Number(event.target.value)),
                    );
                    setColor(rgbToHex(channels[0], channels[1], channels[2]));
                  }}
                  aria-label={`${["Red", "Green", "Blue"][index]} channel`}
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

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
      <AcademicPeriodWriteContextField />
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
          {catalog !== "position" && catalog !== "event_location" && (
            <>
              <CatalogColorPicker
                id={`${fieldId}-color`}
                initialColor={submittedValue(
                  state.values,
                  "color",
                  DEFAULT_CATALOG_COLOR,
                )}
                error={fieldErrors.color}
                align="start"
              />
              <FieldError id={`${fieldId}-color-error`}>
                {fieldErrors.color}
              </FieldError>
            </>
          )}
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

function CatalogColorForm({
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
  const fieldId = `${catalog}-color-${record.id}`;
  return (
    <form action={action} className="catalog-color-form">
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="catalog" value={catalog} />
      <input type="hidden" name="operation" value="color" />
      <input type="hidden" name="id" value={record.id} />
      <CatalogColorPicker
        id={fieldId}
        initialColor={submittedValue(
          state.values,
          "color",
          record.color ?? DEFAULT_CATALOG_COLOR,
        )}
        error={state.fieldErrors?.color}
        previewLabel={record.name}
      />
      <button type="submit" disabled={pending} className="button-secondary">
        {pending ? "Saving…" : "Save color"}
      </button>
      <FieldError id={`${fieldId}-error`}>
        {state.fieldErrors?.color}
      </FieldError>
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
        <CatalogValueBadge color={record.color}>
          {record.name}
        </CatalogValueBadge>
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
      <AcademicPeriodWriteContextField />
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
  readOnly = false,
}: {
  catalog: Catalog;
  title: string;
  records: CatalogRecord[];
  showCreate?: boolean;
  readOnly?: boolean;
}) {
  return (
    <section className="catalog-manager space-y-3">
      <SectionHeading title={title} id="catalog-category-heading" />
      {showCreate && !readOnly && (
        <CatalogForm catalog={catalog} operation="create" />
      )}
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
                  {readOnly ? (
                    <CatalogValueBadge color={record.color}>
                      {record.name}
                    </CatalogValueBadge>
                  ) : (
                    <CatalogRename catalog={catalog} record={record} />
                  )}
                  {catalog !== "position" &&
                    catalog !== "event_location" &&
                    !readOnly && (
                      <CatalogColorForm catalog={catalog} record={record} />
                    )}
                  {deleted && (
                    <span className="catalog-record-status">Deleted</span>
                  )}
                  {!readOnly && (
                    <CatalogForm
                      catalog={catalog}
                      operation={deleted ? "restore" : "delete"}
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
