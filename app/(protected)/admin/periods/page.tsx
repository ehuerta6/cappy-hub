import type { Route } from "next";
import { notFound } from "next/navigation";
import ContextualBackLink from "@/components/contextual-back-link";
import { PageHeader } from "@/components/ui";
import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import { saveAcademicPeriod } from "./actions";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";

const messages: Record<string, string> = {
  admin: "Admin access is required.",
  invalid:
    "Enter a name and a valid date range where the end is on or after the start.",
  overlap:
    "This date range overlaps another academic period. Periods cannot share a date.",
  save: "The period could not be saved.",
};

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
  const { periods } = periodData;
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
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {params.saved && (
        <p role="status" className="text-sm text-muted">
          Period saved.
        </p>
      )}
      {!readOnly && (
        <section aria-labelledby="new-period-heading" className="space-y-3">
          <h2 id="new-period-heading" className="text-lg font-semibold">
            New period
          </h2>
          <form
            action={saveAcademicPeriod}
            className="event-form-fields grid gap-3 rounded-md border border-border p-4 sm:grid-cols-4"
          >
            <AcademicPeriodWriteContextField />
            <label className="sm:col-span-2">
              Name
              <input name="name" required maxLength={80} />
            </label>
            <label>
              Starts
              <input name="starts_on" type="date" required />
            </label>
            <label>
              Ends
              <input name="ends_on" type="date" required />
            </label>
            <div className="sm:col-span-4">
              <button type="submit">Create period</button>
            </div>
          </form>
        </section>
      )}
      <section aria-labelledby="period-list-heading" className="space-y-3">
        <h2 id="period-list-heading" className="text-lg font-semibold">
          Configured periods
        </h2>
        {periods.length === 0 ? (
          <p className="text-sm text-muted">No periods configured yet.</p>
        ) : (
          <ul className="space-y-3">
            {periods.map((period) => (
              <li key={period.id}>
                {readOnly ? (
                  <div className="rounded-md border border-border p-4">
                    <p className="font-medium">{period.name}</p>
                    <p className="text-sm text-muted">
                      {period.starts_on} – {period.ends_on}
                    </p>
                  </div>
                ) : (
                  <form
                    action={saveAcademicPeriod}
                    className="event-form-fields grid gap-3 rounded-md border border-border p-4 sm:grid-cols-4"
                  >
                    <AcademicPeriodWriteContextField />
                    <input type="hidden" name="id" value={period.id} />
                    <label className="sm:col-span-2">
                      Name
                      <input
                        name="name"
                        defaultValue={period.name}
                        required
                        maxLength={80}
                      />
                    </label>
                    <label>
                      Starts
                      <input
                        name="starts_on"
                        type="date"
                        defaultValue={period.starts_on}
                        required
                      />
                    </label>
                    <label>
                      Ends
                      <input
                        name="ends_on"
                        type="date"
                        defaultValue={period.ends_on}
                        required
                      />
                    </label>
                    <div className="sm:col-span-4">
                      <button className="button-secondary" type="submit">
                        Save period
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
