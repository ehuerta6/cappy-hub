"use client";

import { useActionState, useEffect, useState } from "react";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
import { ActionFeedback } from "@/components/ui";
import { emitToast } from "@/components/toast-region";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { saveAcademicPeriodAction } from "./actions";

function formatDurationPreview(
  startsOn: string,
  endsOn: string,
): string | null {
  if (!startsOn || !endsOn) return null;
  const startMs = Date.parse(`${startsOn}T00:00:00Z`);
  const endMs = Date.parse(`${endsOn}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs)
    return null;
  const days = Math.round((endMs - startMs) / 86_400_000) + 1;
  return days >= 14
    ? `${Math.round(days / 7)} weeks (${days} days)`
    : `${days} day${days === 1 ? "" : "s"}`;
}

function deriveDefaultPresetYear(currentDate?: string): number {
  if (currentDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)) {
    const [yearStr, monthStr] = currentDate.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (Number.isFinite(year) && Number.isFinite(month)) {
      return year + (month >= 10 ? 1 : 0);
    }
  }
  return 2026;
}

export function AcademicPeriodForm({
  period,
  currentDate,
}: {
  period?: { id: number; name: string; starts_on: string; ends_on: string };
  currentDate?: string;
}) {
  const [state, action, pending] = useActionState(
    saveAcademicPeriodAction,
    initialFormActionState,
  );
  const [name, setName] = useState(() =>
    submittedValue(state.values, "name", period?.name ?? ""),
  );
  const [startsOn, setStartsOn] = useState(() =>
    submittedValue(state.values, "starts_on", period?.starts_on ?? ""),
  );
  const [endsOn, setEndsOn] = useState(() =>
    submittedValue(state.values, "ends_on", period?.ends_on ?? ""),
  );

  useEffect(() => {
    if (state.success) {
      emitToast(state.success, "success");
    }
  }, [state.success]);

  const defaultYear = deriveDefaultPresetYear(currentDate);
  const presets = [
    {
      label: `Spring ${defaultYear}`,
      starts: `${defaultYear}-01-12`,
      ends: `${defaultYear}-05-15`,
    },
    {
      label: `Summer ${defaultYear}`,
      starts: `${defaultYear}-05-16`,
      ends: `${defaultYear}-08-15`,
    },
    {
      label: `Fall ${defaultYear}`,
      starts: `${defaultYear}-08-16`,
      ends: `${defaultYear}-12-20`,
    },
  ];
  const durationPreview = formatDurationPreview(startsOn, endsOn);

  return (
    <form
      key={
        period
          ? `${period.id}:${period.name}:${period.starts_on}:${period.ends_on}`
          : state.success || "new"
      }
      action={action}
      className={
        period
          ? "event-form-fields mt-3 grid max-w-none gap-3 border-t border-border pt-3 sm:grid-cols-4"
          : "event-form-fields grid max-w-none gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-4"
      }
    >
      <AcademicPeriodWriteContextField />
      {period && <input type="hidden" name="id" value={period.id} />}
      {!period && (
        <div
          className="flex flex-wrap items-center gap-1.5 sm:col-span-4"
          role="group"
          aria-label="Semester presets"
        >
          <span className="text-xs font-medium text-muted">Quick fill:</span>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={pending}
              onClick={() => {
                setName(preset.label);
                setStartsOn(preset.starts);
                setEndsOn(preset.ends);
              }}
              className="!min-h-7 rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-secondary hover:border-brand-border hover:bg-brand-bg hover:text-brand"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <label className="sm:col-span-2">
        Name
        <input
          name="name"
          required
          maxLength={80}
          disabled={pending}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <label>
        Starts
        <input
          name="starts_on"
          type="date"
          required
          disabled={pending}
          value={startsOn}
          onChange={(event) => setStartsOn(event.currentTarget.value)}
        />
      </label>
      <label>
        Ends
        <input
          name="ends_on"
          type="date"
          required
          disabled={pending}
          value={endsOn}
          onChange={(event) => setEndsOn(event.currentTarget.value)}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-4">
        <div className="min-w-0 flex-1">
          {state.error ? (
            <ActionFeedback state={state} />
          ) : durationPreview ? (
            <span className="text-xs font-medium tabular-nums text-muted">
              Duration: {durationPreview}
            </span>
          ) : null}
        </div>
        <button
          className={period ? "button-secondary" : undefined}
          type="submit"
          disabled={pending}
        >
          {pending
            ? period
              ? "Saving…"
              : "Creating…"
            : period
              ? "Save period"
              : "Create period"}
        </button>
      </div>
    </form>
  );
}
