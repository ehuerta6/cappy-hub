import type { NextRequest } from "next/server";
import { canManageEvent } from "@/lib/authorization";
import { exportErrorResponse, requireExportActor } from "@/lib/csv-export-auth";
import { buildCsv, csvFilename, csvResponse, fetchAllPages } from "@/lib/csv";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { formatEventSchedule } from "@/lib/presentation";

const EVENT_ROSTER_CSV_HEADERS = [
  "Officer",
  "UTEP Email",
  "Participation Type",
  "Assigned Volunteer Time Slots",
] as const;

type RosterExportRow = {
  officer_id: number;
  participation_type: string;
  officers: {
    id: number;
    name: string;
    utep_email: string | null;
  };
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireExportActor();
  if (!auth.ok) return auth.response;
  const { actor, supabase } = auth;

  const { id: eventIdParam } = await context.params;
  if (!/^-?[1-9]\d*$/.test(eventIdParam)) {
    return exportErrorResponse("Event not found", 404);
  }
  const eventId = Number(eventIdParam);

  try {
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id,name,event_date,deleted_at,event_branches(branch_id)")
      .eq("id", eventId)
      .maybeSingle();
    if (eventError) throw new Error(eventError.message);
    if (!event) return exportErrorResponse("Event not found", 404);

    const eventBranches = event.event_branches.map(
      ({ branch_id }) => branch_id,
    );
    if (!canManageEvent(actor, eventBranches)) {
      return exportErrorResponse("Event manager access required", 403);
    }

    const [rosterRows, timeSlotsResult] = await Promise.all([
      fetchAllPages<RosterExportRow>(
        (from, to) =>
          supabase
            .from("event_officers")
            .select(
              "officer_id,participation_type,officers!event_officers_officer_id_fkey(id,name,utep_email)",
            )
            .eq("event_id", event.id)
            .is("removed_at", null)
            .order("officers(name)")
            .order("officer_id")
            .range(from, to) as PromiseLike<{
            data: RosterExportRow[] | null;
            error: { message: string } | null;
          }>,
      ),
      supabase
        .from("event_time_slots")
        .select(
          "id,starts_at,ends_at,event_time_slot_officers(officer_id,event_officers!event_time_slot_officers_signup_fkey(removed_at))",
        )
        .eq("event_id", event.id)
        .order("starts_at")
        .order("id"),
    ]);
    if (timeSlotsResult.error) throw new Error(timeSlotsResult.error.message);

    const timeSlots = timeSlotsResult.data ?? [];
    const csvRows = rosterRows.map(
      ({ officers: officer, participation_type }) => {
        const assignedSlots = timeSlots
          .map((slot, index) => ({ slot, index }))
          .filter(({ slot }) =>
            slot.event_time_slot_officers.some(
              ({ officer_id, event_officers: signup }) =>
                officer_id === officer.id && signup?.removed_at == null,
            ),
          )
          .map(
            ({ slot, index }) =>
              `Slot ${index + 1} (${formatEventSchedule(slot.starts_at, slot.ends_at)})`,
          )
          .join("; ");

        return [
          officer.name,
          officer.utep_email ?? "",
          participation_type === "attendee" ? "Attend" : "Volunteer",
          assignedSlots,
        ];
      },
    );

    const { today } = currentDenverWeek(new Date());
    const csv = buildCsv(EVENT_ROSTER_CSV_HEADERS, csvRows);
    return csvResponse(
      csv,
      csvFilename("cappy-hub-event-roster", today, event.name),
      csvRows.length,
    );
  } catch (error) {
    console.error("Failed to export Event roster CSV", error);
    return exportErrorResponse("Could not export Event roster CSV", 500);
  }
}
