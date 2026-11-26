import type { Route } from "next";
import { notFound } from "next/navigation";
import ContextualBackLink from "@/components/contextual-back-link";
import {
  Badge,
  FormMessage,
  PageHeader,
  SectionHeading,
} from "@/components/ui";
import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import { formatCalendarDate } from "@/lib/presentation";
import { AcademicPeriodForm } from "./period-form";

const messages: Record<string, string> = {
  admin: "Admin access is required.",
  invalid:
    "Enter a name and a valid date range where the end is on or after the start.",
  overlap:
    "This date range overlaps another academic period. Periods cannot share a date.",
  save: "The period could not be saved.",
};

function formatPeriodSpan(startsOn: string, endsOn: string) {
  const startMs = Date.parse(`${startsOn}T00:00:00Z`);
  const endMs = Date.parse(`${endsOn}T00:00:00Z`);
  const days =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1)
      : null;
  const duration =
    days === null
      ? ""
      : days >= 14
        ? ` · ${Math.round(days / 7)} wks`
        : ` · ${days} day${days === 1 ? "" : "s"}`;
  return `${formatCalendarDate(startsOn)} – ${formatCalendarDate(endsOn)}${duration}`;
}

export default async function AcademicPeriodsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
    period?: string | string[];
  }>;
}) {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) notFound();
  const [periodData, params] = await Promise.all([
    getAcademicPeriodData(),
    searchParams ??
      Promise.resolve<{
        error?: string;
        saved?: string;
        period?: string | string[];
      }>({}),
  ]);
  const { periods, currentDate, currentPeriodId } = periodData;
  const periodSelection = resolveAcademicPeriod(params.period, periodData);
  const readOnly = periodSelection.isHistorical;
  const error = params.error ? messages[params.error] : undefined;
  return (
    <div data-page-width="wide" data-form-page="periods" className="space-y-5">
      <ContextualBackLink
        href={
          `/admin${params.period ? `?period=${params.period}` : ""}` as Route
        }
      >
        Back to Admin
      </ContextualBackLink>
      <PageHeader
        title="Academic periods"
        description="Create periods for history and planning. Period dates use America/Denver calendar days."
      />
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {params.saved && <FormMessage kind="success">Period saved.</FormMessage>}
      {!readOnly && (
        <section aria-labelledby="new-period-heading" className="space-y-3">
          <SectionHeading title="New period" id="new-period-heading" />
          <AcademicPeriodForm currentDate={currentDate} />
        </section>
      )}
      <section aria-labelledby="period-list-heading" className="space-y-3">
        <SectionHeading
          title={`Configured periods (${periods.length})`}
          id="period-list-heading"
        />
        {periods.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-sm text-muted">
            No periods configured yet.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {periods.map((period) => {
              const status =
                period.id === currentPeriodId
                  ? { label: "Current", tone: "green" as const }
                  : period.ends_on < currentDate
                    ? { label: "Historical", tone: "neutral" as const }
                    : { label: "Upcoming", tone: "blue" as const };
              const spanLabel = formatPeriodSpan(
                period.starts_on,
                period.ends_on,
              );
              return (
                <li key={period.id} className="px-4 py-3">
                  {readOnly ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="text-sm font-semibold text-foreground">
                          {period.name}
                        </span>
                        <span className="text-xs tabular-nums text-muted">
                          {spanLabel}
                        </span>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  ) : (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <span className="text-sm font-semibold text-foreground">
                            {period.name}
                          </span>
                          <span className="text-xs tabular-nums text-muted">
                            {spanLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Badge tone={status.tone}>{status.label}</Badge>
                          <span className="rounded border border-border-strong bg-surface-muted px-2.5 py-1 text-xs font-medium text-secondary group-hover:border-brand-border group-hover:text-foreground">
                            Edit
                          </span>
                        </div>
                      </summary>
                      <AcademicPeriodForm period={period} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
