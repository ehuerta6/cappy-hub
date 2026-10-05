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
    supabase
      .from("tasks")
      .select("id,title,due_date")
      .is("removed_at", null)
      .order("due_date"),
  ]);

  if (events.error || tasks.error)
    throw new Error("Failed to load calendar entries");

  const entries = [
    ...mapEventOccurrences(events.data),
    ...mapTaskOccurrences(tasks.data),
  ];

  return (
    <div data-page-width="wide" className="space-y-5">
      <PageHeader
        title="Calendar"
        description="Events and Task due dates. Select an entry to open its record."
      />
      <CalendarView entries={entries} />
    </div>
  );
}
