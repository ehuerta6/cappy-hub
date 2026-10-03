import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import CalendarView from "./calendar-view";
import { mapEventOccurrences, mapTaskOccurrences } from "./calendar-events";

export default async function CalendarPage() {
  const supabase = await createClient();
  const [events, tasks] = await Promise.all([
    supabase
      .from("events")
      .select("id,name,starts_at,ends_at")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("starts_at"),
    supabase.from("tasks").select("id,title,due_date").order("due_date"),
  ]);

  if (events.error || tasks.error)
    throw new Error("Failed to load calendar entries");

  const entries = [
    ...mapEventOccurrences(events.data),
    ...mapTaskOccurrences(tasks.data),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Events and Task due dates in one view."
      />
      <ul
        aria-label="Calendar entry types"
        className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400"
      >
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="calendar-legend-event" />
          Events
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="calendar-legend-task" />
          Task due dates
        </li>
      </ul>
      <CalendarView entries={entries} />
    </div>
  );
}
