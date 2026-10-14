"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check } from "lucide-react";
import {
  FieldError,
  fieldLabelClassName,
  popupListClassName,
  popupOptionClassName,
  popupSurfaceClassName,
} from "@/components/ui";
import { formatEventFilterOption } from "@/lib/presentation";
import { searchEvents } from "./actions";

type PointEvent = { id: number; name: string; event_date: string };
type EventOption = { id: string; label: string };

function eventOption(event: PointEvent): EventOption {
  return {
    id: String(event.id),
    label: formatEventFilterOption(event.name, event.event_date),
  };
}

export function EventSearchSelect({
  events,
  initialValue = "",
  error,
  disabled = false,
  portalContainer,
}: {
  events: PointEvent[];
  initialValue?: string;
  error?: string;
  disabled?: boolean;
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  const inputId = useId();
  const errorId = useId();
  const requestId = useRef(0);
  const queryRef = useRef("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialValue);
  const [selectedEvent, setSelectedEvent] = useState<PointEvent | null>(
    () => events.find((event) => String(event.id) === initialValue) ?? null,
  );
  const [remoteEvents, setRemoteEvents] = useState<PointEvent[]>([]);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "empty" | "error"
  >("idle");

  const options = useMemo(() => {
    const byId = new Map<string, EventOption>();
    byId.set("", { id: "", label: "No event" });
    for (const event of [
      ...events,
      ...remoteEvents,
      ...(selectedEvent ? [selectedEvent] : []),
    ]) {
      const option = eventOption(event);
      byId.set(option.id, option);
    }
    if (selectedId && !byId.has(selectedId)) {
      byId.set(selectedId, { id: selectedId, label: `Event #${selectedId}` });
    }
    return [...byId.values()];
  }, [events, remoteEvents, selectedEvent, selectedId]);
  const items = useMemo(
    () =>
      Combobox.createItems(options, {
        getValue: (option) => option.id,
        getLabel: (option) => option.label,
      }),
    [options],
  );
  const selectedOption = options.find((option) => option.id === selectedId);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const currentRequest = requestId.current;
    if (normalizedQuery.length < 2) return;

    const timeout = window.setTimeout(async () => {
      try {
        const result = await searchEvents(normalizedQuery);
        if (requestId.current !== currentRequest || queryRef.current !== query)
          return;
        if (result.error) {
          setRemoteEvents([]);
          setSearchState("error");
          return;
        }
        setRemoteEvents(result.events);
        setSearchState(result.events.length ? "idle" : "empty");
      } catch {
        if (
          requestId.current === currentRequest &&
          queryRef.current === query
        ) {
          setRemoteEvents([]);
          setSearchState("error");
        }
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  function updateQuery(value: string) {
    requestId.current += 1;
    queryRef.current = value;
    setQuery(value);
    setRemoteEvents([]);
    setSearchState(value.trim().length >= 2 ? "loading" : "idle");
  }

  return (
    <div className="min-w-0 space-y-1.5 sm:col-span-2">
      <label htmlFor={inputId} className={fieldLabelClassName}>
        Event (optional)
      </label>
      <Combobox.Root
        items={items}
        value={selectedId}
        onValueChange={(value, details) => {
          if (details.reason === "item-press") {
            const nextId = value ?? "";
            setSelectedId(nextId);
            setSelectedEvent(
              nextId
                ? ([...events, ...remoteEvents].find(
                    (event) => String(event.id) === nextId,
                  ) ?? null)
                : null,
            );
            updateQuery("");
          } else if (details.reason === "clear-press") {
            setSelectedId("");
            setSelectedEvent(null);
            updateQuery("");
          } else details.cancel();
        }}
        inputValue={query}
        onInputValueChange={(value, details) => {
          if (details.reason !== "item-press") updateQuery(value);
        }}
        disabled={disabled}
        autoHighlight
      >
        <Combobox.Input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder="Search Events"
          className="min-h-11 w-full rounded-md border border-border-strong bg-surface-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted aria-invalid:border-danger-border aria-invalid:focus-visible:outline-danger"
        />
        <Combobox.Portal container={portalContainer}>
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
                {(option: EventOption) => (
                  <Combobox.Item
                    key={option.id || "no-event"}
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
      <p className="text-xs text-secondary" role="status" aria-live="polite">
        {searchState === "loading" && "Searching Events…"}
        {searchState === "empty" && "No matching Events."}
        {selectedOption && `Selected: ${selectedOption.label}`}
      </p>
      {searchState === "error" && (
        <p className="text-xs text-danger" role="alert">
          Could not search Events. Try again.
        </p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
      <input type="hidden" name="event_id" value={selectedId} />
    </div>
  );
}
