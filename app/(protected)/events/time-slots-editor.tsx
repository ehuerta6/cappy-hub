"use client";

import { useMemo, useState } from "react";

export type TimeSlotDraft = {
  id?: number;
  start_time: string;
  end_time: string;
  capacity: number | null;
};

type AuthoringMethod = "equal" | "custom";

function minuteValue(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function timeValue(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function calculateEqualSlots(
  start: string,
  end: string,
  count: number,
): TimeSlotDraft[] {
  const from = minuteValue(start);
  const to = minuteValue(end);
  if (from === null || to === null || to <= from || count < 1) return [];
  const minutes = to - from;
  if (minutes % count !== 0) return [];
  const width = minutes / count;
  return Array.from({ length: count }, (_, index) => ({
    start_time: timeValue(from + index * width),
    end_time: timeValue(from + (index + 1) * width),
    capacity: null,
  }));
}

function serializeSlots(slots: TimeSlotDraft[]) {
  return slots.map((slot) => ({
    ...(slot.id === undefined ? {} : { id: slot.id }),
    start_time: slot.start_time,
    end_time: slot.end_time,
    capacity: slot.capacity,
  }));
}

export default function TimeSlotsEditor({
  eventStart,
  eventEnd,
  eventTypeName,
  initialSlots,
  enabledInitially,
  activationUnavailableReason,
  onSlotsChange,
}: {
  eventStart: string;
  eventEnd: string;
  eventTypeName: string;
  initialSlots: TimeSlotDraft[];
  enabledInitially: boolean;
  activationUnavailableReason?: string;
  onSlotsChange?: (serialized: string) => void;
}) {
  const [enabled, setEnabled] = useState(enabledInitially);
  const [method, setMethod] = useState<AuthoringMethod>("custom");
  const [slotCount, setSlotCount] = useState(2);
  const [equalCapacities, setEqualCapacities] = useState<(number | null)[]>([]);
  const [customSlots, setCustomSlots] = useState<TimeSlotDraft[]>(
    initialSlots.length
      ? initialSlots
      : [{ start_time: eventStart, end_time: eventEnd, capacity: null }],
  );
  const equalDrafts = useMemo(
    () =>
      calculateEqualSlots(eventStart, eventEnd, slotCount).map(
        (slot, index) => ({
          ...slot,
          capacity: equalCapacities[index] ?? null,
        }),
      ),
    [eventStart, eventEnd, equalCapacities, slotCount],
  );
  const slots = method === "equal" ? equalDrafts : customSlots;
  const serialized = enabled ? JSON.stringify(serializeSlots(slots)) : "null";

  const updateCustom = (index: number, patch: Partial<TimeSlotDraft>) => {
    setCustomSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    );
  };

  return (
    <fieldset className="event-form-section col-span-2">
      <legend>Time Slots (optional)</legend>
      <input type="hidden" name="time_slots" value={serialized} />
      {eventTypeName.toLowerCase() === "session" ? (
        <p className="text-sm text-muted">
          Time Slots are unavailable for Session Events. Sessions use Presenter
          Slots.
        </p>
      ) : (
        <div className="space-y-3">
          {activationUnavailableReason ? (
            <p className="text-sm text-muted">{activationUnavailableReason}</p>
          ) : (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  setEnabled(event.currentTarget.checked);
                  onSlotsChange?.(
                    event.currentTarget.checked
                      ? JSON.stringify(serializeSlots(slots))
                      : "null",
                  );
                }}
              />
              <span>Divide this Event into Time Slots</span>
            </label>
          )}
          {enabled && !activationUnavailableReason && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Officers choose the slots they can attend. Each selected slot
                has its own capacity and participation Points.
              </p>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Authoring method
                </legend>
                {initialSlots.length === 0 && (
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="time_slot_method"
                      value="equal"
                      checked={method === "equal"}
                      onChange={() => {
                        setMethod("equal");
                        onSlotsChange?.(
                          JSON.stringify(serializeSlots(equalDrafts)),
                        );
                      }}
                    />
                    Equal Time Slots
                  </label>
                )}
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="time_slot_method"
                    value="custom"
                    checked={method === "custom"}
                    onChange={() => {
                      setMethod("custom");
                      onSlotsChange?.(
                        JSON.stringify(serializeSlots(customSlots)),
                      );
                    }}
                  />
                  Custom Time Slots
                </label>
              </fieldset>
              {method === "equal" ? (
                <div className="space-y-3">
                  <label>
                    Number of equal slots
                    <input
                      type="number"
                      min="1"
                      max="24"
                      step="1"
                      value={slotCount}
                      onChange={(event) => {
                        const next = Number(event.currentTarget.value);
                        const nextCount = Number.isInteger(next) ? next : 1;
                        setSlotCount(nextCount);
                        onSlotsChange?.(
                          JSON.stringify(
                            serializeSlots(
                              calculateEqualSlots(
                                eventStart,
                                eventEnd,
                                nextCount,
                              ).map((slot, index) => ({
                                ...slot,
                                capacity: equalCapacities[index] ?? null,
                              })),
                            ),
                          ),
                        );
                      }}
                    />
                    <span className="text-sm text-muted">
                      The Event duration in minutes must divide evenly by this
                      number.
                    </span>
                  </label>
                  <div className="event-form-fields">
                    {equalDrafts.map((slot, index) => (
                      <label key={index}>
                        Slot {index + 1} capacity (optional)
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={slot.capacity ?? ""}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            const capacity = value ? Number(value) : null;
                            const nextSlots = equalDrafts.map(
                              (equalSlot, slotIndex) =>
                                slotIndex === index
                                  ? { ...equalSlot, capacity }
                                  : equalSlot,
                            );
                            setEqualCapacities(
                              nextSlots.map(({ capacity }) => capacity),
                            );
                            onSlotsChange?.(
                              JSON.stringify(serializeSlots(nextSlots)),
                            );
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {customSlots.map((slot, index) => (
                    <fieldset
                      key={slot.id ?? index}
                      className="event-form-section"
                    >
                      <legend>Slot {index + 1}</legend>
                      <div className="event-form-fields">
                        <label>
                          Start time
                          <input
                            type="time"
                            value={slot.start_time}
                            onChange={(event) => {
                              updateCustom(index, {
                                start_time: event.currentTarget.value,
                              });
                              onSlotsChange?.(
                                JSON.stringify(
                                  serializeSlots(
                                    customSlots.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            start_time:
                                              event.currentTarget.value,
                                          }
                                        : item,
                                    ),
                                  ),
                                ),
                              );
                            }}
                          />
                        </label>
                        <label>
                          End time
                          <input
                            type="time"
                            value={slot.end_time}
                            onChange={(event) => {
                              updateCustom(index, {
                                end_time: event.currentTarget.value,
                              });
                              onSlotsChange?.(
                                JSON.stringify(
                                  serializeSlots(
                                    customSlots.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            end_time: event.currentTarget.value,
                                          }
                                        : item,
                                    ),
                                  ),
                                ),
                              );
                            }}
                          />
                        </label>
                        <label>
                          Capacity (optional)
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={slot.capacity ?? ""}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              updateCustom(index, {
                                capacity: value ? Number(value) : null,
                              });
                              onSlotsChange?.(
                                JSON.stringify(
                                  serializeSlots(
                                    customSlots.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            capacity: value
                                              ? Number(value)
                                              : null,
                                          }
                                        : item,
                                    ),
                                  ),
                                ),
                              );
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={customSlots.length < 2}
                          onClick={() => {
                            const next = customSlots.filter(
                              (_, itemIndex) => itemIndex !== index,
                            );
                            setCustomSlots(next);
                            onSlotsChange?.(
                              JSON.stringify(serializeSlots(next)),
                            );
                          }}
                        >
                          Remove slot {index + 1}
                        </button>
                      </div>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      const next = [
                        ...customSlots,
                        {
                          start_time: eventStart,
                          end_time: eventEnd,
                          capacity: null,
                        },
                      ];
                      setCustomSlots(next);
                      onSlotsChange?.(JSON.stringify(serializeSlots(next)));
                    }}
                  >
                    Add custom slot
                  </button>
                </div>
              )}
              {slots.length > 0 && (
                <ol className="space-y-1 text-sm text-muted">
                  {slots.map((slot, index) => (
                    <li key={slot.id ?? index}>
                      Slot {index + 1}: {slot.start_time}–{slot.end_time}
                      {slot.capacity === null
                        ? " · Unlimited capacity"
                        : ` · Capacity ${slot.capacity}`}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
