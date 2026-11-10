import Link from "next/link";
import { SectionHeading } from "@/components/ui";
import { denverParts } from "@/lib/event-time";
import type { Tables } from "@/lib/database.types";
import { overlappingSlotPairs, slotIsFull } from "@/lib/time-slot-conflicts";
import {
  AssignOfficerToTimeSlotForm,
  JoinAllTimeSlotsForm,
  JoinSelectedTimeSlotsForm,
  LeaveAllTimeSlotsForm,
  LeaveTimeSlotForm,
  RemoveOfficerFromTimeSlotForm,
} from "./time-slot-controls";

export type EventTimeSlotWithRoster = Pick<
  Tables<"event_time_slots">,
  "id" | "starts_at" | "ends_at" | "capacity"
> & {
  event_time_slot_officers: {
    officer_id: number;
    is_self_signup?: boolean | null;
    officers: Pick<Tables<"officers">, "id" | "name"> | null;
    event_officers?: Pick<Tables<"event_officers">, "removed_at"> | null;
  }[];
};

export function isSelfTimeSlotSignup(
  createdBy: string | null,
  actorAuthUserId: string,
): boolean | null {
  return createdBy === null ? null : createdBy === actorAuthUserId;
}

export default function TimeSlotsSection({
  eventId,
  slots,
  actorId,
  canCorrectAssignments,
  signupOpen,
  confirmed,
  activeOfficer,
  eventCapacityBlocked,
  officers,
  past,
  period,
}: {
  eventId: number;
  slots: EventTimeSlotWithRoster[];
  actorId: number;
  canCorrectAssignments: boolean;
  signupOpen: boolean;
  confirmed: boolean;
  activeOfficer: boolean;
  eventCapacityBlocked: boolean;
  officers: Pick<Tables<"officers">, "id" | "name">[];
  past: boolean;
  period?: string;
}) {
  const activeSlots = slots.map((slot) => ({
    ...slot,
    event_time_slot_officers: slot.event_time_slot_officers.filter(
      ({ event_officers }) => event_officers?.removed_at == null,
    ),
  }));
  const selected = activeSlots.filter((slot) =>
    slot.event_time_slot_officers.some(
      ({ officer_id }) => officer_id === actorId,
    ),
  );
  const scheduleConflicts = overlappingSlotPairs(
    activeSlots.map((slot, index) => ({ ...slot, position: index + 1 })),
  );
  const availableToJoin = activeSlots.flatMap((slot, index) =>
    !slot.event_time_slot_officers.some(
      ({ officer_id }) => officer_id === actorId,
    ) &&
    (slot.capacity === null ||
      slot.event_time_slot_officers.length < slot.capacity)
      ? [{ ...slot, position: index + 1 }]
      : [],
  );
  const allSelected = selected.length === activeSlots.length;
  const fullUnselectedSlot = activeSlots.find(
    (slot) =>
      !slot.event_time_slot_officers.some(
        ({ officer_id }) => officer_id === actorId,
      ) && slotIsFull(slot.capacity, slot.event_time_slot_officers.length),
  );
  const joinAllReasons = [
    eventCapacityBlocked
      ? "The Event has reached its confirmed signup capacity."
      : undefined,
    fullUnselectedSlot
      ? `Slot ${activeSlots.findIndex(({ id }) => id === fullUnselectedSlot.id) + 1} is full; choose available slots instead.`
      : undefined,
    scheduleConflicts.length > 0
      ? `${scheduleConflicts.map(([first, second]) => `Slots ${first.position} and ${second.position}`).join("; ")} overlap; choose non-overlapping slots instead.`
      : undefined,
  ].filter((reason): reason is string => reason !== undefined);
  const joinAllBlocked = joinAllReasons.length > 0;
  const joinAllHint = joinAllReasons.join(" ") || undefined;

  return (
    <section aria-label="Time Slots" className="min-w-0 space-y-3">
      <SectionHeading
        title={`Time Slots (${activeSlots.length})`}
        description="Choose one or more slots. Each selected slot is counted and awarded separately."
      />
      {activeSlots.length === 0 ? (
        <p className="text-sm text-muted">No Time Slots are configured.</p>
      ) : (
        <ol className="space-y-3">
          {activeSlots.map((slot, index) => {
            const registered = slot.event_time_slot_officers
              .map(({ officers: officer }) => officer)
              .filter(
                (officer): officer is Pick<Tables<"officers">, "id" | "name"> =>
                  officer !== null,
              )
              .sort((left, right) => left.name.localeCompare(right.name));
            const ownRegistration = slot.event_time_slot_officers.find(
              ({ officer_id }) => officer_id === actorId,
            );
            const ownSlot = ownRegistration !== undefined;
            const full = slotIsFull(slot.capacity, registered.length);
            const start = denverParts(slot.starts_at).time;
            const end = denverParts(slot.ends_at).time;
            return (
              <li
                key={slot.id}
                className="space-y-2 rounded-md border border-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="font-medium">
                    Slot {index + 1}: {start}–{end}
                  </h3>
                  <span className="text-muted">
                    {registered.length}
                    {slot.capacity === null
                      ? " registered"
                      : ` / ${slot.capacity} registered`}
                  </span>
                </div>
                <p className="text-sm font-medium" aria-live="polite">
                  {ownSlot
                    ? ownRegistration.is_self_signup === true
                      ? "Self signed up"
                      : ownRegistration.is_self_signup === false
                        ? "Assigned by a manager"
                        : "Signup attribution unavailable"
                    : full
                      ? "Full — unavailable"
                      : "Open — available"}
                </p>
                <p className="text-muted">
                  {registered.length ? (
                    <span className="sr-only">Registered Officers: </span>
                  ) : null}
                  {registered.length ? (
                    <span aria-label="Registered Officers">
                      {registered.map((officer, officerIndex) => (
                        <span key={officer.id}>
                          {officerIndex > 0 ? ", " : ""}
                          <Link
                            href={`/officers/${officer.id}${period ? `?period=${period}` : ""}`}
                            className="underline underline-offset-4"
                          >
                            {officer.name}
                          </Link>
                        </span>
                      ))}
                    </span>
                  ) : (
                    "No Officers registered yet."
                  )}
                </p>
                {signupOpen && ownSlot && (
                  <LeaveTimeSlotForm
                    eventId={eventId}
                    slotId={slot.id}
                    slotName={`slot ${index + 1}`}
                  />
                )}
                {canCorrectAssignments && (
                  <div className="space-y-2 border-t border-border pt-2">
                    {registered.map((officer) => (
                      <div key={officer.id}>
                        <RemoveOfficerFromTimeSlotForm
                          eventId={eventId}
                          slotId={slot.id}
                          officerId={officer.id}
                          officerName={officer.name}
                        />
                      </div>
                    ))}
                    {canCorrectAssignments &&
                      (full ? (
                        <p className="text-sm text-muted">
                          This slot is full; managers cannot add another
                          Officer.
                        </p>
                      ) : (
                        <AssignOfficerToTimeSlotForm
                          eventId={eventId}
                          slot={slot}
                          officers={officers.filter(
                            ({ id }) =>
                              !registered.some(
                                (registeredOfficer) =>
                                  registeredOfficer.id === id,
                              ),
                          )}
                          existingAssignments={activeSlots.flatMap(
                            (assignedSlot, assignedIndex) =>
                              assignedSlot.event_time_slot_officers.map(
                                ({ officer_id }) => ({
                                  officerId: officer_id,
                                  slot: {
                                    id: assignedSlot.id,
                                    starts_at: assignedSlot.starts_at,
                                    ends_at: assignedSlot.ends_at,
                                    position: assignedIndex + 1,
                                  },
                                }),
                              ),
                          )}
                        />
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {signupOpen && activeOfficer && (
        <div className="space-y-2">
          {selected.length > 0 && (
            <p className="text-sm text-muted">
              Your saved selections:{" "}
              {selected
                .map(
                  (slot) =>
                    `Slot ${activeSlots.findIndex(({ id }) => id === slot.id) + 1}`,
                )
                .join(", ")}
              . Use “Leave” on a selected slot to change your choices.
            </p>
          )}
          {eventCapacityBlocked ? (
            <p className="text-sm text-muted">
              The Event has reached its confirmed signup capacity, so you cannot
              add a first slot selection.
            </p>
          ) : (
            availableToJoin.length > 0 && (
              <JoinSelectedTimeSlotsForm
                eventId={eventId}
                slots={availableToJoin}
                currentSelections={selected.map((slot) => ({
                  id: slot.id,
                  starts_at: slot.starts_at,
                  ends_at: slot.ends_at,
                  position:
                    activeSlots.findIndex(({ id }) => id === slot.id) + 1,
                }))}
              />
            )
          )}
          <JoinAllTimeSlotsForm
            eventId={eventId}
            disabled={joinAllBlocked}
            hint={joinAllHint}
          />
          {selected.length > 0 && <LeaveAllTimeSlotsForm eventId={eventId} />}
        </div>
      )}

      {!signupOpen && !past && (
        <p className="text-sm text-muted">Time Slot signups are closed.</p>
      )}
      {!confirmed && selected.length > 0 && (
        <p className="text-sm text-muted">
          Your selected slots are saved with the Event signup.
        </p>
      )}
      {allSelected && selected.length > 0 && (
        <p className="text-sm text-muted">
          You are signed up for every Time Slot.
        </p>
      )}
      {canCorrectAssignments && activeSlots.length > 0 && (
        <p className="text-sm text-muted">
          Manager assignments apply the chosen slots to each selected Officer.
          Each Officer must have a non-overlapping selection.
        </p>
      )}
    </section>
  );
}
