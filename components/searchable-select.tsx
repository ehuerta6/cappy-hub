"use client";

import { useId, useMemo, useState, type RefObject } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, X } from "lucide-react";
import {
  FieldError,
  fieldLabelClassName,
  popupListClassName,
  popupOptionClassName,
  popupSurfaceClassName,
} from "@/components/ui";

export type SearchableSelectOption = { id: string; label: string };

export function SearchableSelect({
  name,
  label,
  options,
  initialValue = "",
  required = false,
  disabled = false,
  error,
  placeholder = "Search and select",
  portalContainer,
  initialFocus = false,
}: {
  name: string;
  label: string;
  options: SearchableSelectOption[];
  initialValue?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  portalContainer?: RefObject<HTMLElement | null>;
  initialFocus?: boolean;
}) {
  const inputId = useId();
  const errorId = useId();
  const optionIds = useMemo(
    () => new Set(options.map((option) => option.id)),
    [options],
  );
  const items = useMemo(
    () =>
      Combobox.createItems(options, {
        getValue: (option) => option.id,
        getLabel: (option) => option.label,
      }),
    [options],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    optionIds.has(initialValue) ? initialValue : null,
  );
  const [query, setQuery] = useState("");
  const validSelectedId =
    selectedId && optionIds.has(selectedId) ? selectedId : null;
  const selectedLabel = options.find(
    (option) => option.id === validSelectedId,
  )?.label;

  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={inputId} className={fieldLabelClassName}>
        {label}
      </label>
      <Combobox.Root
        items={items}
        value={validSelectedId}
        onValueChange={(value, details) => {
          // Only a chosen option or the clear control changes the submitted ID.
          if (details.reason === "item-press") {
            setSelectedId(value);
            setQuery("");
          } else if (details.reason === "clear-press") {
            setSelectedId(null);
            setQuery("");
          } else details.cancel();
        }}
        inputValue={query}
        onInputValueChange={(value, details) => {
          if (details.reason !== "item-press") setQuery(value);
        }}
        disabled={disabled}
        autoHighlight
      >
        <div className="flex min-w-0 items-center rounded-md border border-border-strong bg-surface-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-muted has-[[aria-invalid=true]]:border-danger-border has-[[aria-invalid=true]]:focus-within:outline-danger">
          <Combobox.Input
            id={inputId}
            data-initial-focus={initialFocus ? "" : undefined}
            aria-required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            disabled={disabled}
            placeholder={placeholder}
            className="min-w-0 flex-1 border-0! bg-transparent! outline-none! focus-visible:outline-none!"
          />
          <Combobox.Clear
            aria-label={`Clear ${label.toLowerCase()} search or selection`}
            disabled={disabled}
            className="mr-1 flex size-9 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-secondary hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
          >
            <X aria-hidden="true" size={16} />
          </Combobox.Clear>
        </div>
        <Combobox.Portal container={portalContainer}>
          <Combobox.Positioner
            align="start"
            sideOffset={4}
            positionMethod="fixed"
            className="z-50 w-(--anchor-width)"
          >
            <Combobox.Popup className={`${popupSurfaceClassName} p-1`}>
              <Combobox.Empty className="px-3 py-2 text-sm text-muted">
                {options.length
                  ? "No matching options."
                  : "No options available."}
              </Combobox.Empty>
              <Combobox.List className={popupListClassName}>
                {(option: SearchableSelectOption) => (
                  <Combobox.Item
                    key={option.id}
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
      {selectedLabel && (
        <p className="break-words text-xs text-secondary" aria-live="polite">
          Selected:{" "}
          <span className="font-medium text-foreground">{selectedLabel}</span>
        </p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
      <input type="hidden" name={name} value={validSelectedId ?? ""} />
    </div>
  );
}
