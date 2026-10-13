"use client";

import { useId, useMemo, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check } from "lucide-react";
import {
  FieldError,
  popupListClassName,
  popupOptionClassName,
  popupSurfaceClassName,
} from "@/components/ui";

/** A free-text Event location input with matching catalog suggestions. */
export function EventLocationAutocomplete({
  locations,
  initialValue = "",
  value,
  onValueChange,
  error,
}: {
  locations: { id: number; name: string }[];
  initialValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  error?: string;
}) {
  const inputId = useId();
  const errorId = useId();
  const [uncontrolledInputValue, setUncontrolledInputValue] =
    useState(initialValue);
  const inputValue = value ?? uncontrolledInputValue;
  const [selectedLocation, setSelectedLocation] = useState<string | null>(() =>
    locations.some((location) => location.name === initialValue)
      ? initialValue
      : null,
  );
  const updateInputValue = (nextValue: string) => {
    setUncontrolledInputValue(nextValue);
    onValueChange?.(nextValue);
  };
  const items = useMemo(
    () =>
      Combobox.createItems(locations, {
        getValue: (location) => location.name,
        getLabel: (location) => location.name,
      }),
    [locations],
  );

  return (
    <div className="event-location-autocomplete">
      <Combobox.Root
        items={items}
        filter={(location, query) =>
          location.name.toLowerCase().includes(query.trim().toLowerCase())
        }
        inputValue={inputValue}
        value={selectedLocation}
        onInputValueChange={(nextValue, details) => {
          if (details.reason !== "item-press") setSelectedLocation(null);
          updateInputValue(nextValue);
        }}
        onValueChange={(value) => {
          setSelectedLocation(value);
          if (value !== null) updateInputValue(value);
        }}
        autoHighlight
      >
        <div className="event-location-input-wrap">
          <Combobox.Input
            id={inputId}
            name="location"
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            placeholder="Enter or search for a location"
            className="min-w-0 w-full"
          />
        </div>
        <Combobox.Portal>
          <Combobox.Positioner
            align="start"
            sideOffset={4}
            positionMethod="fixed"
            className="z-50 w-(--anchor-width)"
          >
            <Combobox.Popup className={`${popupSurfaceClassName} p-1`}>
              <Combobox.Empty className="px-3 py-2 text-sm text-muted">
                No matching catalog locations. Your text will be used as
                entered.
              </Combobox.Empty>
              <Combobox.List className={popupListClassName}>
                {(location: { id: number; name: string }) => (
                  <Combobox.Item
                    key={location.id}
                    value={location.name}
                    className={popupOptionClassName}
                  >
                    <Combobox.ItemIndicator className="mt-0.5 w-4 shrink-0 text-secondary">
                      <Check aria-hidden="true" size={16} />
                    </Combobox.ItemIndicator>
                    <span className="min-w-0 whitespace-normal break-words">
                      {location.name}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
