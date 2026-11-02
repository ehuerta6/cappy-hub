import { PageHeader } from "@/components/ui";
import CalendarView from "./calendar-view";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, periodData] = await Promise.all([
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
    getAcademicPeriodData(),
  ]);
  const periodSelection = resolveAcademicPeriod(params.period, periodData);
  return (
    <div data-page-width="wide" className="space-y-5">
      <PageHeader
        title="Calendar"
        description={
          periodSelection.period
            ? `${periodSelection.period.name}${periodSelection.isHistorical ? " · Historical · read only" : ""}. Events and Task due dates.`
            : "Events and Task due dates. Select an entry to open its record."
        }
      />
      <CalendarView
        key={periodSelection.period?.id ?? "none"}
        periodId={periodSelection.period?.id ?? null}
        periodQuery={
          Array.isArray(params.period) ? params.period[0] : params.period
        }
        initialDate={
          periodSelection.period?.starts_on ?? periodData.currentDate
        }
      />
    </div>
  );
}
