import { PageHeader } from "@/components/ui";
import CalendarView from "./calendar-view";

export default function CalendarPage() {
  return (
    <div data-page-width="wide" className="space-y-5">
      <PageHeader
        title="Calendar"
        description="Events and Task due dates. Select an entry to open its record."
      />
      <CalendarView />
    </div>
  );
}
