"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check } from "lucide-react";
import {
  fieldLabelClassName,
  popupListClassName,
  popupOptionClassName,
  popupSurfaceClassName,
} from "@/components/ui";
import { formatEventFilterOption } from "@/lib/presentation";
import { searchPointHistoryEvents } from "./actions";

type PointHistoryEvent = { id: number; name: string; event_date: string };
type Option = { id: string; label: string };

function toOption(event: PointHistoryEvent): Option {
  return {
    id: String(event.id),
    label: formatEventFilterOption(event.name, event.event_date),
  };
}

export default function PointHistoryEventFilter({
  initialValue = "",
  selectedEvent,
}: {
  initialValue?: string;
  selectedEvent: PointHistoryEvent | null;
}) {
  const inputId = useId();
  const queryRef = useRef("");
  const [selectedId, setSelectedId] = useState(initialValue);
  const [selectedRecord, setSelectedRecord] = useState(selectedEvent);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PointHistoryEvent[]>([]);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "empty" | "error"
  >("idle");

  const options = useMemo(() => {
    const byId = new Map<string, Option>();
    byId.set("", { id: "", label: "All events" });
    if (selectedRecord)
      byId.set(String(selectedRecord.id), toOption(selectedRecord));
    for (const event of results) byId.set(String(event.id), toOption(event));
    if (selectedId && !byId.has(selectedId))
      byId.set(selectedId, {
        id: selectedId,
        label: `Event #${selectedId} (name unavailable)`,
      });
    return [...byId.values()];
  }, [results, selectedRecord, selectedId]);
  const items = useMemo(
    () =>
      Combobox.createItems(options, {
        getValue: (option) => option.id,
        getLabel: (option) => option.label,
      }),
    [options],
  );
  const selectedLabel = options.find(
    (option) => option.id === selectedId,
  )?.label;

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) return;
    const timeout = window.setTimeout(async () => {
      try {
        const result = await searchPointHistoryEvents(normalizedQuery);
        if (queryRef.current.trim() !== normalizedQuery) return;
        if (result.error) {
          setResults([]);
          setSearchState("error");
          return;
        }
        setResults(result.events);
        setSearchState(result.events.length ? "idle" : "empty");
      } catch {
        if (queryRef.current.trim() === normalizedQuery) {
          setResults([]);
          setSearchState("error");
        }
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  function updateQuery(value: string) {
    queryRef.current = value;
    setQuery(value);
    setResults([]);
    setSearchState(value.trim().length >= 2 ? "loading" : "idle");
  }

  return (
    <div className="min-w-48 flex-1 space-y-1.5">
      <label htmlFor={inputId} className={fieldLabelClassName}>
        Event
      </label>
      <Combobox.Root
        items={items}
        value={selectedId}
        onValueChange={(value, details) => {
          if (details.reason === "item-press") {
            const nextId = value ?? "";
            setSelectedId(nextId);
            setSelectedRecord(
              nextId
                ? (results.find((event) => String(event.id) === nextId) ??
                    selectedRecord)
                : null,
            );
            updateQuery("");
          } else if (details.reason === "clear-press") {
            setSelectedId("");
            setSelectedRecord(null);
            updateQuery("");
          } else details.cancel();
        }}
        inputValue={query}
        onInputValueChange={(value, details) => {
          if (details.reason !== "item-press") updateQuery(value);
        }}
        autoHighlight
      >
        <Combobox.Input
          id={inputId}
          placeholder="Search Events"
          className="min-h-11 w-full rounded-md border border-border-strong bg-surface-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
        />
        <Combobox.Portal>
          <Combobox.Positioner
            align="start"
            sideOffset={4}
            positionMethod="fixed"
            className="z-50 w-(--anchor-width)"
          >
            <Combobox.Popup className={`${popupSurfaceClassName} p-1`}>
              <Combobox.Empty className="px-3 py-2 text-sm text-muted">
                {query.trim().length < 2
                  ? "Type at least two characters to search Events."
                  : searchState === "loading" || searchState === "error"
                    ? ""
                    : "No matching Events."}
              </Combobox.Empty>
              <Combobox.List className={popupListClassName}>
                {(option: Option) => (
                  <Combobox.Item
                    key={option.id || "all-events"}
                    value={option.id}
                    className={popupOptionClassName}
                  >
                    <Combobox.ItemIndicator className="mt-0.5 w-4 shrink-0 text-secondary">
                      <Check aria-hidden="true" size={16} />
                    </Combobox.ItemIndicator>
                    <span className="min-w-0 whitespace-normal break-words">
                      {option.label}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      <p
        className="break-words text-xs text-secondary"
        role="status"
        aria-live="polite"
      >
        {searchState === "loading" && "Searching Events…"}
        {searchState === "empty" && "No matching Events."}
        {selectedLabel && `Selected: ${selectedLabel}`}
      </p>
      {searchState === "error" && (
        <p className="text-xs text-danger" role="alert">
          Could not search Events. Try again.
        </p>
      )}
      <input type="hidden" name="event" value={selectedId} />
    </div>
  );
}
