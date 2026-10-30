import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { SectionHeading } from "@/components/ui";

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

export default function PresenterSlotsSection({
  slots,
}: {
  slots: PresenterSlot[];
}) {
  if (slots.length === 0) return null;

  return (
    <section
      aria-label="Historical presentations"
      className="min-w-0 space-y-3"
    >
      <SectionHeading title="Historical presentations" />
      <ol className="space-y-3">
        {slots.map((slot) => (
          <li
            key={slot.id}
            className="space-y-2 rounded-md border border-border p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-medium">Presentation {slot.position}</span>
              {slot.officers ? (
                <Link
                  href={`/officers/${slot.officers.id}`}
                  className="underline underline-offset-4"
                >
                  {slot.officers.name}
                </Link>
              ) : (
                <span className="text-muted">No assigned Officer</span>
              )}
              {slot.difficulty?.trim() && (
                <span className="text-muted">{slot.difficulty}</span>
              )}
            </div>
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
          </li>
        ))}
      </ol>
    </section>
  );
}
