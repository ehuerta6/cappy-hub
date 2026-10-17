import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import CalendarView from "./calendar-view";
import { mapEventOccurrences, mapTaskOccurrences } from "./calendar-events";
import { fetchCalendarRecords } from "./calendar-query";

export default async function CalendarPage() {
  const supabase = await createClient();
  const [events, tasks] = await fetchCalendarRecords(supabase);

  const entries = [
    ...mapEventOccurrences(events),
    ...mapTaskOccurrences(tasks),
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
