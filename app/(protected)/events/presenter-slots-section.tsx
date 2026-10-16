import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { SectionHeading } from "@/components/ui";
import {
  AddPresenterSlotForm,
  AssignPresenterForm,
  MovePresenterSlotForm,
  PresenterSlotChangeForm,
  PresenterSlotDetailsForm,
  RemovePresenterSlotForm,
} from "./presenter-slot-controls";

export type PresenterSlot = Pick<
  Tables<"presentation_slots">,
  | "id"
  | "position"
  | "officer_id"
  | "presentation_title"
  | "difficulty"
  | "resource_url"
  | "prep_notes"
> & { officers: Pick<Tables<"officers">, "id" | "name"> | null };

function moved(slotIds: number[], index: number, offset: -1 | 1) {
  const order = [...slotIds];
  [order[index], order[index + offset]] = [order[index + offset], order[index]];
  return order;
}

export default function PresenterSlotsSection({
  eventId,
  slots,
  actorId,
  canManage,
  canVolunteer,
  volunteerBlockedReason,
  closedReason,
  officers,
}: {
  eventId: number;
  slots: PresenterSlot[];
  actorId: number;
  canManage: boolean;
  canVolunteer: boolean;
  volunteerBlockedReason: string | null;
  closedReason: string | null;
  officers: Pick<Tables<"officers">, "id" | "name">[];
}) {
  const open = closedReason === null;
  const slotIds = slots.map(({ id }) => id);
  const openCount = slots.filter(
    ({ officer_id }) => officer_id === null,
  ).length;
  return (
    <section aria-label="Presenters" className="min-w-0 space-y-3">
      <SectionHeading
        title={`Presenters (${slots.length})`}
        description={
          !slots.length
            ? undefined
            : open
              ? `${openCount} of ${slots.length} slots open. Volunteering also signs you up for this Session.`
              : `${openCount} of ${slots.length} slots open.`
        }
      />
      {!open && (
        <p className="text-sm text-muted">
          Presenter slots are closed. {closedReason}
        </p>
      )}
      {open && canVolunteer && volunteerBlockedReason && openCount > 0 && (
        <p className="text-sm text-muted">{volunteerBlockedReason}</p>
      )}
      {slots.length ? (
        <ol className="space-y-3">
          {slots.map((slot, index) => {
            const presenter = slot.officers;
            const ownSlot = slot.officer_id === actorId;
            const difficulty = slot.difficulty?.trim();
            return (
              <li
                key={slot.id}
                aria-label={`Slot ${slot.position}`}
                className="space-y-2 rounded-md border border-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">Slot {slot.position}</span>
                  <span>
                    {presenter ? (
                      <Link
                        href={`/officers/${presenter.id}`}
                        className="underline underline-offset-4"
                      >
                        {presenter.name}
                      </Link>
                    ) : (
                      <span className="text-muted">Open</span>
                    )}
                  </span>
                  {difficulty && (
                    <span className="text-muted">{difficulty}</span>
                  )}
                </div>
                {(slot.presentation_title ||
                  slot.resource_url ||
                  slot.prep_notes) && (
                  <div className="space-y-1">
                    {slot.presentation_title && (
                      <p className="break-words">{slot.presentation_title}</p>
                    )}
                    {slot.resource_url && (
                      <a
                        href={slot.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block break-all underline underline-offset-4"
                      >
                        Resource link
                      </a>
                    )}
                    {slot.prep_notes && (
                      <p className="whitespace-pre-wrap break-words text-muted">
                        {slot.prep_notes}
                      </p>
                    )}
                  </div>
                )}
                {open && (
                  <div className="flex flex-wrap items-start gap-2 [&>form]:w-auto">
                    {presenter === null &&
                      canVolunteer &&
                      !volunteerBlockedReason && (
                        <PresenterSlotChangeForm
                          slotId={slot.id}
                          label="Volunteer"
                          pendingLabel="Volunteering…"
                          accessibleLabel={`Volunteer for slot ${slot.position}`}
                        />
                      )}
                    {presenter !== null && ownSlot && (
                      <PresenterSlotChangeForm
                        slotId={slot.id}
                        officerId={actorId}
                        release
                        label="Step down"
                        pendingLabel="Stepping down…"
                        accessibleLabel={`Step down from slot ${slot.position}`}
                      />
                    )}
                    {presenter !== null && !ownSlot && canManage && (
                      <PresenterSlotChangeForm
                        slotId={slot.id}
                        officerId={presenter.id}
                        release
                        label="Remove presenter"
                        pendingLabel="Removing…"
                        accessibleLabel={`Remove ${presenter.name} from slot ${slot.position}`}
                      />
                    )}
                    {canManage && index > 0 && (
                      <MovePresenterSlotForm
                        eventId={eventId}
                        slotIds={moved(slotIds, index, -1)}
                        label="Move up"
                        accessibleLabel={`Move slot ${slot.position} up`}
                      />
                    )}
                    {canManage && index < slots.length - 1 && (
                      <MovePresenterSlotForm
                        eventId={eventId}
                        slotIds={moved(slotIds, index, 1)}
                        label="Move down"
                        accessibleLabel={`Move slot ${slot.position} down`}
                      />
                    )}
                    {canManage && presenter === null && (
                      <RemovePresenterSlotForm
                        slotId={slot.id}
                        position={slot.position}
                      />
                    )}
                  </div>
                )}
                {open && (canManage || ownSlot) && (
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {presenter === null && officers.length > 0 && (
                      <details className="event-roster-disclosure">
                        <summary>Assign presenter</summary>
                        <AssignPresenterForm
                          slotId={slot.id}
                          position={slot.position}
                          officers={officers}
                        />
                      </details>
                    )}
                    <details className="event-roster-disclosure">
                      <summary>Edit details</summary>
                      <PresenterSlotDetailsForm slot={slot} />
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted">No presenter slots yet.</p>
      )}
      {open && canManage && <AddPresenterSlotForm eventId={eventId} />}
    </section>
  );
}
