import Link from "next/link";
import { SectionHeading } from "@/components/ui";
import { denverParts } from "@/lib/event-time";
import type { Tables } from "@/lib/database.types";
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
    officers: Pick<Tables<"officers">, "id" | "name"> | null;
  }[];
};

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
}) {
  const selected = slots.filter((slot) =>
    slot.event_time_slot_officers.some(
      ({ officer_id }) => officer_id === actorId,
    ),
  );
  const availableToJoin = slots.filter(
    (slot) =>
      !slot.event_time_slot_officers.some(
        ({ officer_id }) => officer_id === actorId,
      ) &&
      (slot.capacity === null ||
        slot.event_time_slot_officers.length < slot.capacity),
  );
  const allSelected = selected.length === slots.length;
  const fullUnselectedSlot = slots.find(
    (slot) =>
      !slot.event_time_slot_officers.some(
        ({ officer_id }) => officer_id === actorId,
      ) &&
      slot.capacity !== null &&
      slot.event_time_slot_officers.length >= slot.capacity,
  );
  const joinAllBlocked =
    eventCapacityBlocked || fullUnselectedSlot !== undefined;
  const joinAllHint = eventCapacityBlocked
    ? "The Event has reached its confirmed signup capacity."
    : fullUnselectedSlot
      ? `Slot ${slots.findIndex(({ id }) => id === fullUnselectedSlot.id) + 1} is full. Choose available slots instead.`
      : undefined;

  return (
    <section aria-label="Time Slots" className="min-w-0 space-y-3">
      <SectionHeading
        title={`Time Slots (${slots.length})`}
        description="Choose one or more slots. Each selected slot is counted and awarded separately."
      />
      {slots.length === 0 ? (
        <p className="text-sm text-muted">No Time Slots are configured.</p>
      ) : (
        <ol className="space-y-3">
          {slots.map((slot, index) => {
            const registered = slot.event_time_slot_officers
              .map(({ officers: officer }) => officer)
              .filter(
                (officer): officer is Pick<Tables<"officers">, "id" | "name"> =>
                  officer !== null,
              )
              .sort((left, right) => left.name.localeCompare(right.name));
            const ownSlot = registered.some(({ id }) => id === actorId);
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
                            href={`/officers/${officer.id}`}
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
                    {canCorrectAssignments && (
                      <AssignOfficerToTimeSlotForm
                        eventId={eventId}
                        slotId={slot.id}
                        officers={officers.filter(
                          ({ id }) =>
                            !registered.some(
                              (registeredOfficer) =>
                                registeredOfficer.id === id,
                            ),
                        )}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {signupOpen && activeOfficer && (
        <div className="space-y-2">
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
    </section>
  );
}
