"use client";

import { useId, useMemo, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { formatEventFilterOption } from "@/lib/presentation";

type EventOption = {
  id: number;
  name: string;
  event_date: string;
  status: string;
  deleted_at: string | null;
};

function eventLabel(event: EventOption) {
  return `${formatEventFilterOption(event.name, event.event_date)}${
    event.deleted_at
      ? " (Archived)"
      : event.status === "cancelled"
        ? " (Cancelled)"
        : ""
  }`;
}

export function TaskEventCombobox({
  events,
  initialSelectedIds,
  error,
  onSelectionChange,
}: {
  events: EventOption[];
  initialSelectedIds: string[];
  error?: string;
  onSelectionChange: (ids: string[]) => void;
}) {
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);
  const items = useMemo(
    () =>
      Combobox.createItems(events, {
        getValue: (event) => String(event.id),
        getLabel: eventLabel,
      }),
    [events],
  );
  const eventById = useMemo(
    () => new Map(events.map((event) => [String(event.id), event])),
    [events],
  );

  function updateSelection(value: string[]) {
    setSelectedIds(value);
    onSelectionChange(value);
  }

  return (
    <div className="col-span-2 min-w-0 space-y-1.5">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-secondary"
      >
        Linked Events
      </label>
      <Combobox.Root
        items={items}
        multiple
        value={selectedIds}
        onValueChange={(value) => updateSelection((value ?? []).map(String))}
        autoHighlight
      >
        <Combobox.Chips className="flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-md border border-border-strong bg-surface-muted px-2 py-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-muted">
          <Combobox.Value>
            {(value: string[]) =>
              value.map((id) => {
                const event = eventById.get(String(id));
                if (!event) return null;
                const label = eventLabel(event);
                return (
                  <Combobox.Chip
                    key={id}
                    aria-label={label}
                    className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-secondary"
                  >
                    <span className="max-w-full whitespace-normal break-words">
                      {label}
                    </span>
                    <Combobox.ChipRemove
                      aria-label={`Remove ${label}`}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-secondary hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-muted"
                    >
                      <span aria-hidden="true">×</span>
                    </Combobox.ChipRemove>
                  </Combobox.Chip>
                );
              })
            }
          </Combobox.Value>
          <Combobox.Input
            id={inputId}
            aria-label="Linked Events"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${helpId} ${errorId}` : helpId}
            placeholder="Search and select Events"
            className="min-w-40 flex-1 border-0 bg-transparent px-1 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus-visible:outline-none"
          />
        </Combobox.Chips>
        <Combobox.Portal>
          <Combobox.Positioner
            align="start"
            sideOffset={4}
            className="z-50 w-(--anchor-width)"
          >
            <Combobox.Popup className="overflow-hidden rounded-md border border-border-strong bg-surface p-1 text-foreground shadow-lg">
              <Combobox.Empty className="px-3 py-2 text-sm text-muted">
                {events.length ? "No matching Events." : "No eligible Events."}
              </Combobox.Empty>
              <Combobox.List className="max-h-72 overflow-y-auto">
                {(event: EventOption) => {
                  const label = eventLabel(event);
                  return (
                    <Combobox.Item
                      key={event.id}
                      value={String(event.id)}
                      className="flex cursor-default items-start gap-2 rounded px-2 py-2 text-sm text-secondary outline-none data-[highlighted]:bg-hover data-[selected]:text-foreground"
                    >
                      <Combobox.ItemIndicator className="mt-0.5 w-4 shrink-0 text-secondary">
                        ✓
                      </Combobox.ItemIndicator>
                      <span className="min-w-0 whitespace-normal break-words">
                        {label}
                      </span>
                    </Combobox.Item>
                  );
                }}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      <p id={helpId} className="text-sm text-muted">
        Optional context: search and select any number of Events, then remove
        them from their chips. Links do not change Event or Task permissions,
        completion, or Points.
      </p>
      {error && (
        <span id={errorId} className="text-sm text-danger">
          {error}
        </span>
      )}
      {selectedIds.map((id) => (
        <input
          key={`submission-${id}`}
          type="hidden"
          name="event_ids"
          value={id}
        />
      ))}
    </div>
  );
}
