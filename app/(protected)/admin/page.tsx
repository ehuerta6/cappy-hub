import { Badge, PageHeader } from "@/components/ui";
import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { getAcademicPeriodData } from "@/lib/academic-periods";
import { createClient } from "@/lib/supabase/server";
import { Award, CalendarRange, Tags, Users } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

const adminAreas = [
  {
    key: "periods",
    title: "Academic periods",
    description:
      "Create and maintain non-overlapping periods used for history and planning.",
    href: "/admin/periods" as Route,
    link: "Manage periods",
    icon: CalendarRange,
  },
  {
    key: "officers",
    title: "Officer access",
    description:
      "Manage application roles and officer warnings from an officer’s profile. Officer records and everyday workflows remain in Officers.",
    href: "/officers" as Route,
    link: "Manage officers",
    icon: Users,
  },
  {
    key: "catalogs",
    title: "Catalogs",
    description:
      "Manage the club values used by Officers, Events, Tasks and branch-scoped work.",
    href: "/officers/catalogs" as Route,
    link: "Manage catalogs",
    icon: Tags,
  },
  {
    key: "points",
    title: "Points awards and corrections",
    description:
      "Add manual Point awards or corrections, then review and remove existing awards.",
    href: "/points" as Route,
    link: "Open points administration",
    icon: Award,
  },
] as const;

type AdminMetrics = {
  activePeriodName: string | null;
  activeOfficersCount: number;
  officersNeedingReview: number;
  calendarFailureCount: number;
};

async function loadAdminMetrics(): Promise<AdminMetrics | null> {
  try {
    const [supabase, periodData] = await Promise.all([
      createClient(),
      getAcademicPeriodData(),
    ]);
    const [officersResult, warningsResult, calendarFailuresResult] =
      await Promise.all([
        supabase
          .from("officers")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase
          .from("officer_warnings")
          .select("officer_id")
          .eq("status", "approved")
          .is("voided_at", null)
          .is("deleted_at", null),
        supabase
          .from("event_calendar_sync_failures")
          .select("event_id", { count: "exact", head: true }),
      ]);
    const warningsByOfficer = new Map<number, number>();
    for (const row of warningsResult.data ?? []) {
      warningsByOfficer.set(
        row.officer_id,
        (warningsByOfficer.get(row.officer_id) ?? 0) + 1,
      );
    }
    let officersNeedingReview = 0;
    for (const count of warningsByOfficer.values()) {
      if (count >= 3) officersNeedingReview += 1;
    }
    const currentPeriod = periodData.periods.find(
      (period) => period.id === periodData.currentPeriodId,
    );
    return {
      activePeriodName: currentPeriod?.name ?? null,
      activeOfficersCount: officersResult.count ?? 0,
      officersNeedingReview,
      calendarFailureCount: calendarFailuresResult.count ?? 0,
    };
  } catch {
    return null;
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) notFound();

  const [params, metrics] = await Promise.all([
    searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({}),
    loadAdminMetrics(),
  ]);
  const periodSuffix =
    params.period === undefined ? "" : `?period=${String(params.period)}`;
  return (
    <div data-page-width="wide" data-nav-page="admin" className="space-y-5">
      <PageHeader
        title="Admin"
        description="Application-wide administration for Coding Interview Club."
      />
      {metrics && metrics.calendarFailureCount > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger"
        >
          <span>
            <strong>
              {metrics.calendarFailureCount} Calendar sync{" "}
              {metrics.calendarFailureCount === 1 ? "failure" : "failures"}
            </strong>{" "}
            need retry from the Events page.
          </span>
        </div>
      )}
      <nav aria-label="Administration areas">
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {adminAreas.map((area) => {
            const Icon = area.icon;
            return (
              <li key={area.href} className="min-w-0">
                <Link
                  className="admin-area-link group flex h-full min-h-11 flex-col items-start gap-2 rounded-lg border border-border bg-surface px-4 py-4 hover:border-border-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  href={`${area.href}${periodSuffix}` as Route}
                >
                  <div className="flex w-full flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface-muted text-brand">
                        <Icon aria-hidden="true" size={16} />
                      </span>
                      <h2 className="font-semibold text-foreground group-hover:underline group-hover:underline-offset-4">
                        {area.title}
                      </h2>
                    </div>
                    {metrics && area.key === "periods" && (
                      <Badge tone={metrics.activePeriodName ? "green" : "amber"}>
                        {metrics.activePeriodName ?? "No active period"}
                      </Badge>
                    )}
                    {metrics && area.key === "officers" && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">
                          {metrics.activeOfficersCount} active
                        </Badge>
                        {metrics.officersNeedingReview > 0 && (
                          <Badge tone="amber">
                            {metrics.officersNeedingReview} with 3+ warnings
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-muted">{area.description}</span>
                  <span className="text-sm font-medium text-brand">
                    {area.link}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
