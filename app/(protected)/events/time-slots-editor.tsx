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

function formatSlotEstimate(start: string, end: string) {
  const from = minuteValue(start);
  const to = minuteValue(end);
  if (from === null || to === null || to <= from) return null;
  const minutes = to - from;
  const hours = minutes / 60;
  const durationLabel =
    minutes < 60
      ? `${minutes}m`
      : minutes % 60 === 0
        ? `${hours}h`
        : `${Math.floor(hours)}h ${minutes % 60}m`;
  const volunteerPts = Math.round(hours * 2 * 100) / 100;
  return `${durationLabel} · +${volunteerPts} pts`;
}

function validEqualDivisors(start: string, end: string) {
  const from = minuteValue(start);
  const to = minuteValue(end);
  if (from === null || to === null || to <= from) return [];
  const minutes = to - from;
  const divisors: number[] = [];
  for (let count = 2; count <= 12; count += 1) {
    if (minutes % count === 0 && minutes / count >= 15) divisors.push(count);
  }
  return divisors.slice(0, 6);
}

function findOverlappingSlots(slots: TimeSlotDraft[]) {
  const minutes = slots.map((slot) => ({
    start: minuteValue(slot.start_time),
    end: minuteValue(slot.end_time),
  }));
  const pairs: [number, number][] = [];
  for (let left = 0; left < minutes.length; left += 1) {
    for (let right = left + 1; right < minutes.length; right += 1) {
      const first = minutes[left];
      const second = minutes[right];
      if (
        first.start !== null &&
        first.end !== null &&
        second.start !== null &&
        second.end !== null &&
        first.start < second.end &&
        second.start < first.end
      ) {
        pairs.push([left + 1, right + 1]);
      }
    }
  }
  return pairs;
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
  onEnabledChange,
  onSlotsChange,
}: {
  eventStart: string;
  eventEnd: string;
  eventTypeName: string;
  initialSlots: TimeSlotDraft[];
  enabledInitially: boolean;
  activationUnavailableReason?: string;
  onEnabledChange?: (enabled: boolean) => void;
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
  const overlappingSlots = findOverlappingSlots(slots);
  const serialized = enabled ? JSON.stringify(serializeSlots(slots)) : "null";
  const eventFrom = minuteValue(eventStart);
  const eventTo = minuteValue(eventEnd);
  const totalMinutes =
    eventFrom !== null && eventTo !== null && eventTo > eventFrom
      ? eventTo - eventFrom
      : null;
  const suggestedDivisors = useMemo(
    () => validEqualDivisors(eventStart, eventEnd),
    [eventStart, eventEnd],
  );

  const updateCustom = (index: number, patch: Partial<TimeSlotDraft>) => {
    setCustomSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    );
  };

  const applyEqualCount = (nextCount: number) => {
    setSlotCount(nextCount);
    onSlotsChange?.(
      JSON.stringify(
        serializeSlots(
          calculateEqualSlots(eventStart, eventEnd, nextCount).map(
            (slot, index) => ({
              ...slot,
              capacity: equalCapacities[index] ?? null,
            }),
          ),
        ),
      ),
    );
  };

  return (
    <fieldset className="event-form-section lg:col-span-2">
      <legend>Time Slots (optional)</legend>
      <input type="hidden" name="time_slots" value={serialized} />
      {eventTypeName.toLowerCase() === "session" ? (
        <p className="text-sm text-muted">
          Volunteer Time Slots are unavailable for Session Events. Officers use
          the ordinary Event signup options instead.
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
                  const nextEnabled = event.currentTarget.checked;
                  setEnabled(nextEnabled);
                  onEnabledChange?.(nextEnabled);
                  onSlotsChange?.(
                    nextEnabled
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
                  <label className="max-w-xs">
                    Number of equal slots
                    <input
                      type="number"
                      min="1"
                      max="24"
                      step="1"
                      value={slotCount}
                      onChange={(event) => {
                        const next = Number(event.currentTarget.value);
                        applyEqualCount(Number.isInteger(next) ? next : 1);
                      }}
                    />
                    <span className="text-xs text-muted">
                      The Event duration in minutes must divide evenly by this
                      number.
                    </span>
                  </label>
                  {totalMinutes !== null && equalDrafts.length === 0 && (
                    <div
                      role="status"
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-muted/60 px-3 py-2 text-xs text-muted"
                    >
                      <span>
                        {totalMinutes} min doesn’t divide evenly by {slotCount}.
                        {suggestedDivisors.length > 0 ? " Try:" : ""}
                      </span>
                      {suggestedDivisors.map((divisor) => (
                        <button
                          key={divisor}
                          type="button"
                          onClick={() => applyEqualCount(divisor)}
                          className="!min-h-6 rounded border border-border-strong bg-surface px-2 py-0.5 text-xs font-medium text-secondary hover:border-brand-border hover:bg-brand-bg hover:text-brand"
                        >
                          {divisor} slots
                        </button>
                      ))}
                    </div>
                  )}
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
                <div className="space-y-2.5">
                  {customSlots.map((slot, index) => {
                    const estimate = formatSlotEstimate(
                      slot.start_time,
                      slot.end_time,
                    );
                    return (
                      <div
                        key={slot.id ?? index}
                        className="rounded-md border border-border bg-surface-muted/35 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            Slot {index + 1}
                          </span>
                          {estimate && (
                            <span className="text-xs tabular-nums text-muted">
                              {estimate}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8.5rem_auto]">
                          <label className="grid gap-1 text-xs font-medium text-secondary">
                            Start time
                            <input
                              type="time"
                              value={slot.start_time}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                updateCustom(index, { start_time: value });
                                onSlotsChange?.(
                                  JSON.stringify(
                                    serializeSlots(
                                      customSlots.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, start_time: value }
                                          : item,
                                      ),
                                    ),
                                  ),
                                );
                              }}
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-secondary">
                            End time
                            <input
                              type="time"
                              value={slot.end_time}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                updateCustom(index, { end_time: value });
                                onSlotsChange?.(
                                  JSON.stringify(
                                    serializeSlots(
                                      customSlots.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, end_time: value }
                                          : item,
                                      ),
                                    ),
                                  ),
                                );
                              }}
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-secondary">
                            Capacity (optional)
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={slot.capacity ?? ""}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                const capacity = value ? Number(value) : null;
                                updateCustom(index, { capacity });
                                onSlotsChange?.(
                                  JSON.stringify(
                                    serializeSlots(
                                      customSlots.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, capacity }
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
                      </div>
                    );
                  })}
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
              {slots.length > 0 &&
                totalMinutes !== null &&
                eventFrom !== null && (
                  <div className="space-y-1.5 rounded-md border border-border bg-surface-muted/30 p-3">
                    <div className="flex items-center justify-between text-[11px] font-medium tabular-nums text-muted">
                      <span>{eventStart}</span>
                      <span>Timeline preview</span>
                      <span>{eventEnd}</span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-muted"
                    >
                      {slots.map((slot, index) => {
                        const start = minuteValue(slot.start_time);
                        const end = minuteValue(slot.end_time);
                        if (start === null || end === null || end <= start)
                          return null;
                        const leftPct = Math.max(
                          0,
                          Math.min(
                            100,
                            ((start - eventFrom) / totalMinutes) * 100,
                          ),
                        );
                        const widthPct = Math.max(
                          2,
                          Math.min(
                            100 - leftPct,
                            ((end - start) / totalMinutes) * 100,
                          ),
                        );
                        return (
                          <div
                            key={slot.id ?? index}
                            className="absolute inset-y-0 rounded-full border border-surface bg-brand/80"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                            }}
                          />
                        );
                      })}
                    </div>
                    <ol className="space-y-1 pt-1 text-xs text-muted">
                      {slots.map((slot, index) => {
                        const estimate = formatSlotEstimate(
                          slot.start_time,
                          slot.end_time,
                        );
                        return (
                          <li key={slot.id ?? index} className="tabular-nums">
                            Slot {index + 1}: {slot.start_time}–{slot.end_time}
                            {estimate ? ` (${estimate})` : ""}
                            {slot.capacity === null
                              ? " · Unlimited capacity"
                              : ` · Capacity ${slot.capacity}`}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              {overlappingSlots.length > 0 && (
                <p
                  className="feedback-message feedback-warning text-sm"
                  role="note"
                >
                  Schedule note:{" "}
                  {overlappingSlots
                    .map(([first, second]) => `Slots ${first} and ${second}`)
                    .join("; ")}{" "}
                  overlap. Overlapping times are allowed, but an Officer cannot
                  sign up for both overlapping slots.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
