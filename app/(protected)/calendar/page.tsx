import Link from "next/link";
import type { Route } from "next";
import { ActionLink, Badge, PageHeader } from "@/components/ui";
import { ViewTabs } from "@/components/view-tabs";
import CalendarView from "./calendar-view";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import {
  canEditEvent,
  canSeeAllBranches,
  getAuthorizationContext,
  isLead,
} from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mapEventOccurrences, mapTaskOccurrences } from "./calendar-events";
import {
  fetchCalendarRecordsForRange,
  type CalendarScopeFilter,
} from "./calendar-query";
import { parseCalendarRange } from "./calendar-range";
import {
  formatCalendarDate,
  formatEventSchedule,
  formatRelativeDayCue,
} from "@/lib/presentation";
import { denverParts } from "@/lib/event-time";
import { withPeriodParam } from "@/lib/period-url";

export const dynamic = "force-dynamic";

function addDaysIso(dateIso: string, deltaDays: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function initialMonthRange(dateIso: string) {
  const [yearStr, monthStr] = dateIso.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastOfMonth = new Date(Date.UTC(year, month, 0));
  const start = new Date(firstOfMonth);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(lastOfMonth);
  end.setUTCDate(end.getUTCDate() + 14);
  return parseCalendarRange(start.toISOString(), end.toISOString());
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, periodData, actor] = await Promise.all([
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
    getAcademicPeriodData(),
    getAuthorizationContext().catch(() => null),
  ]);
  const periodSelection = resolveAcademicPeriod(params.period, periodData);
  const initialDate = periodSelection.isHistorical
    ? periodSelection.period?.starts_on
    : periodData.currentDate;
  const periodQuery = Array.isArray(params.period)
    ? params.period[0]
    : params.period;
  const rawScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const rawLayout = Array.isArray(params.layout)
    ? params.layout[0]
    : params.layout;
  const rawKind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const rawAnchor = Array.isArray(params.anchor)
    ? params.anchor[0]
    : params.anchor;
  const layout: "month" | "agenda" =
    rawLayout === "agenda" ? "agenda" : "month";
  const agendaKind: "all" | "event" | "task" =
    rawKind === "event" || rawKind === "task" ? rawKind : "all";
  const agendaAnchor =
    rawAnchor && /^\d{4}-\d{2}-\d{2}$/.test(rawAnchor)
      ? rawAnchor
      : initialDate;
  const hasOwnBranches = Boolean(actor && actor.branchIds.length > 0);
  const scope: "all" | "mine" | "branch" =
    rawScope === "mine"
      ? "mine"
      : rawScope === "branch" && hasOwnBranches
        ? "branch"
        : "all";

  let initialEntries = undefined;
  let loadFailed = false;
  if (initialDate) {
    try {
      const supabase = await createClient();
      const range =
        layout === "agenda" && agendaAnchor
          ? (() => {
              const startIso = addDaysIso(agendaAnchor, -7);
              const endIso = addDaysIso(agendaAnchor, 52);
              return parseCalendarRange(
                `${startIso}T00:00:00.000Z`,
                `${endIso}T23:59:59.999Z`,
              );
            })()
          : initialMonthRange(initialDate);
      const period = periodSelection.period
        ? {
            from: periodSelection.period.starts_on,
            through: periodSelection.period.ends_on,
          }
        : undefined;
      const scopeFilter: CalendarScopeFilter | undefined =
        scope === "mine" && actor
          ? { officerId: actor.id }
          : scope === "branch" && actor && actor.branchIds.length > 0
            ? { branchIds: actor.branchIds }
            : undefined;
      const [events, tasks] = await fetchCalendarRecordsForRange(
        supabase,
        range,
        period,
        scopeFilter,
      );
      initialEntries = [
        ...mapEventOccurrences(events),
        ...mapTaskOccurrences(tasks),
      ];
    } catch {
      initialEntries = undefined;
      loadFailed = true;
    }
  }

  const canCreateEvent = Boolean(
    actor && !periodSelection.isHistorical && canEditEvent(actor),
  );
  const canCreateTask = Boolean(
    actor &&
    !periodSelection.isHistorical &&
    (canSeeAllBranches(actor) || (isLead(actor) && actor.branchIds.length > 0)),
  );
  const calendarHref = (
    nextScope: "all" | "mine" | "branch",
    nextLayout: "month" | "agenda",
    opts?: { kind?: "all" | "event" | "task"; anchor?: string | null },
  ): Route => {
    const query = new URLSearchParams();
    if (periodQuery) query.set("period", periodQuery);
    if (nextScope !== "all") query.set("scope", nextScope);
    if (nextLayout === "agenda") {
      query.set("layout", "agenda");
      const nextKind = opts?.kind ?? agendaKind;
      if (nextKind !== "all") query.set("kind", nextKind);
      const nextAnchor =
        opts && "anchor" in opts ? opts.anchor : (rawAnchor ?? null);
      if (nextAnchor && nextAnchor !== initialDate) {
        query.set("anchor", nextAnchor);
      }
    }
    const serialized = query.toString();
    return (serialized ? `/calendar?${serialized}` : "/calendar") as Route;
  };

  const filteredAgendaEntries =
    layout === "agenda"
      ? (initialEntries ?? []).filter((entry) =>
          agendaKind === "all" ? true : entry.extendedProps.kind === agendaKind,
        )
      : [];

  const agendaEventCount = filteredAgendaEntries.filter(
    (entry) => entry.extendedProps.kind === "event",
  ).length;
  const agendaTaskCount = filteredAgendaEntries.length - agendaEventCount;

  const agendaGroups =
    layout === "agenda"
      ? (() => {
          const sorted = [...filteredAgendaEntries].sort((a, b) =>
            String(a.start).localeCompare(String(b.start)),
          );
          const groups = new Map<string, typeof sorted>();
          for (const entry of sorted) {
            const dateKey = entry.allDay
              ? String(entry.start).slice(0, 10)
              : denverParts(String(entry.start)).date;
            const bucket = groups.get(dateKey) ?? [];
            bucket.push(entry);
            groups.set(dateKey, bucket);
          }
          return [...groups.entries()];
        })()
      : [];

  const renderKey = `${periodSelection.period?.id ?? "none"}-${scope}-${initialDate ?? ""}`;
  return (
    <div data-page-width="wide" data-nav-page="calendar" className="space-y-5">
      <PageHeader
        title="Calendar"
        description={
          periodSelection.period
            ? `${periodSelection.period.name}${periodSelection.isHistorical ? " · Historical · read only" : ""}. Events and Task due dates.`
            : "Events and Task due dates. Select an entry to open its record."
        }
        action={
          canCreateEvent || canCreateTask ? (
            <div className="flex flex-wrap items-center gap-2">
              {canCreateTask && (
                <Link
                  href={withPeriodParam("/tasks/new", periodQuery)}
                  className="button-secondary inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium lg:min-h-0"
                >
                  + New task
                </Link>
              )}
              {canCreateEvent && (
                <ActionLink href={withPeriodParam("/events/new", periodQuery)}>
                  + New event
                </ActionLink>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        {actor ? (
          <ViewTabs
            label="Calendar quick views"
            items={[
              {
                key: "all",
                label: "All club",
                href: calendarHref("all", layout),
                active: scope === "all",
              },
              {
                key: "mine",
                label: "My schedule",
                href: calendarHref("mine", layout),
                active: scope === "mine",
              },
              ...(hasOwnBranches
                ? [
                    {
                      key: "branch",
                      label:
                        actor.branchIds.length === 1
                          ? "My branch"
                          : "My branches",
                      href: calendarHref("branch", layout),
                      active: scope === "branch",
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <div />
        )}
        <div
          role="group"
          aria-label="Calendar layout"
          className="mb-1.5 inline-flex items-center rounded-md border border-border bg-surface-muted p-0.5 text-xs font-medium"
        >
          {(
            [
              { value: "month", label: "Month" },
              { value: "agenda", label: "Agenda" },
            ] as const
          ).map((item) => (
            <Link
              key={item.value}
              href={calendarHref(scope, item.value)}
              aria-current={layout === item.value ? "page" : undefined}
              className={`rounded px-2.5 py-1 transition-colors ${
                layout === item.value
                  ? "bg-surface text-foreground shadow-xs"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {layout === "agenda" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
            <div
              role="group"
              aria-label="Filter Agenda entries"
              className="inline-flex items-center gap-1 text-xs font-medium"
            >
              {(
                [
                  { value: "all", label: "All" },
                  { value: "event", label: "Events" },
                  { value: "task", label: "Tasks" },
                ] as const
              ).map((item) => (
                <Link
                  key={item.value}
                  href={calendarHref(scope, "agenda", { kind: item.value })}
                  aria-current={agendaKind === item.value ? "page" : undefined}
                  className={`rounded-md border px-2.5 py-1 transition-colors ${
                    agendaKind === item.value
                      ? "border-brand-border bg-brand-bg text-brand"
                      : "border-transparent text-secondary hover:bg-hover hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {!loadFailed && (
                <span className="tabular-nums">
                  {agendaEventCount} event{agendaEventCount === 1 ? "" : "s"} ·{" "}
                  {agendaTaskCount} task{agendaTaskCount === 1 ? "" : "s"}
                </span>
              )}
              {agendaAnchor && (
                <div className="inline-flex items-center gap-1">
                  <Link
                    href={calendarHref(scope, "agenda", {
                      anchor: addDaysIso(agendaAnchor, -60),
                    })}
                    className="button-secondary inline-flex min-h-7 items-center rounded-md border px-2 py-0.5 text-xs"
                  >
                    Prev 60d
                  </Link>
                  {agendaAnchor !== initialDate && (
                    <Link
                      href={calendarHref(scope, "agenda", { anchor: null })}
                      className="button-secondary inline-flex min-h-7 items-center rounded-md border px-2 py-0.5 text-xs"
                    >
                      Today
                    </Link>
                  )}
                  <Link
                    href={calendarHref(scope, "agenda", {
                      anchor: addDaysIso(agendaAnchor, 60),
                    })}
                    className="button-secondary inline-flex min-h-7 items-center rounded-md border px-2 py-0.5 text-xs"
                  >
                    Next 60d
                  </Link>
                </div>
              )}
            </div>
          </div>

          {loadFailed ? (
            <div
              className="feedback-message feedback-error flex flex-wrap items-center justify-between gap-2 text-sm"
              role="alert"
            >
              <span>
                Could not load Calendar entries. Try refreshing the page.
              </span>
              <Link
                href={calendarHref(scope, "agenda")}
                className="button-secondary inline-flex min-h-8 items-center rounded-md border px-3 py-1 text-xs"
              >
                Retry
              </Link>
            </div>
          ) : agendaGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
              <p className="text-sm text-muted">
                No Events or Task due dates in this schedule view.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {agendaGroups.map(([dateKey, entries]) => {
                const relCue = formatRelativeDayCue(dateKey);
                return (
                  <section
                    key={dateKey}
                    aria-label={formatCalendarDate(dateKey)}
                    className="overflow-hidden rounded-lg border border-border bg-surface"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted/60 px-4 py-2">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                        {formatCalendarDate(dateKey)}
                        {relCue ? ` · ${relCue}` : ""}
                      </h2>
                      <span className="text-xs tabular-nums text-muted">
                        {entries.length}{" "}
                        {entries.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <ul className="divide-y divide-border">
                      {entries.map((entry) => {
                        const isEvent = entry.extendedProps.kind === "event";
                        const href = withPeriodParam(
                          entry.url ?? "/calendar",
                          periodQuery,
                        );
                        return (
                          <li key={entry.id}>
                            <Link
                              href={href}
                              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-hover"
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <Badge tone={isEvent ? "blue" : "amber"}>
                                  {isEvent ? "Event" : "Task"}
                                </Badge>
                                <span className="truncate font-medium text-foreground">
                                  {entry.title}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-muted">
                                {isEvent && entry.end
                                  ? formatEventSchedule(
                                      String(entry.start),
                                      String(entry.end),
                                    )
                                  : "Due"}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <CalendarView
          key={renderKey}
          periodId={periodSelection.period?.id ?? null}
          periodQuery={periodQuery}
          initialDate={initialDate}
          initialEntries={initialEntries}
          scope={scope}
        />
      )}
    </div>
  );
}
