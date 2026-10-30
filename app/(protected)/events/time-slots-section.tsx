import Link from "next/link";
import { SectionHeading } from "@/components/ui";
import { denverParts } from "@/lib/event-time";
import type { Tables } from "@/lib/database.types";

export type EventTimeSlotWithRoster = Pick<
  Tables<"event_time_slots">,
  "id" | "starts_at" | "ends_at" | "capacity"
> & {
  event_time_slot_officers: {
    officer_id: number;
    officers: Pick<Tables<"officers">, "id" | "name"> | null;
    event_officers?: Pick<Tables<"event_officers">, "removed_at"> | null;
  }[];
};

export default function TimeSlotsSection({
  slots,
}: {
  slots: EventTimeSlotWithRoster[];
}) {
  if (slots.length === 0) return null;

  return (
    <section aria-label="Historical Time Slots" className="min-w-0 space-y-3">
      <SectionHeading
        title={`Historical Time Slots (${slots.length})`}
        description="Existing Time Slot and signup records are retained for historical reference."
      />
      <ol className="space-y-3">
        {slots.map((slot, index) => {
          const start = denverParts(slot.starts_at).time;
          const end = denverParts(slot.ends_at).time;
          const assigned = slot.event_time_slot_officers
            .map(({ officer_id, officers, event_officers }) => ({
              id: officers?.id ?? officer_id,
              name: officers?.name ?? `Officer ${officer_id}`,
              removed: event_officers?.removed_at != null,
            }))
            .sort((left, right) => left.name.localeCompare(right.name));

          return (
            <li
              key={slot.id}
              className="space-y-2 rounded-md border border-border p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="font-medium">
                  Slot {index + 1}: {start}–{end}
                </h3>
                {slot.capacity !== null && (
                  <span className="text-muted">
                    Historical capacity: {slot.capacity}
                  </span>
                )}
              </div>
              <ul className="space-y-1 text-muted">
                {assigned.length ? (
                  assigned.map((entry, entryIndex) => (
                    <li key={`${entry.id}-${entryIndex}`}>
                      <Link
                        href={`/officers/${entry.id}`}
                        className="underline underline-offset-4"
                      >
                        {entry.name}
                      </Link>
                      {entry.removed && <span> — Event signup removed</span>}
                    </li>
                  ))
                ) : (
                  <li>No historical signup records.</li>
                )}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
