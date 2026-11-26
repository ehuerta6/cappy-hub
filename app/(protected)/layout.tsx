import Link from "next/link";
import SiteNavigation from "@/components/site-navigation";
import { requireCurrentOfficer } from "@/lib/current-officer";
import { signOut } from "@/app/auth/actions";
import { getAcademicPeriodData } from "@/lib/academic-periods";
import { enrichOfficerNotifications } from "@/lib/notification-enrichment";
import { createClient } from "@/lib/supabase/server";
import NotificationReviewTracker from "@/components/notification-review-tracker";
import HistoricalPeriodBanner from "@/components/historical-period-banner";
import ToastRegion from "@/components/toast-region";
import ScrollToTop from "@/components/scroll-to-top";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const officer = await requireCurrentOfficer();
  const academicPeriods = await getAcademicPeriodData();
  const supabase = await createClient();
  const [recentNotifications, unreadNotifications] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id,title,message,kind,entity_type,entity_id,href,created_at,read_at",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);
  if (recentNotifications.error || unreadNotifications.error)
    throw new Error("Failed to load the notification preview");
  const enrichedRecentNotifications = await enrichOfficerNotifications(
    supabase,
    recentNotifications.data ?? [],
  );
  return (
    <div className="app-shell">
      <NotificationReviewTracker />
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:not-sr-only focus:rounded-md focus:border focus:border-border-strong focus:bg-surface focus:px-3 focus:py-2 focus:text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-brand"
      >
        Skip to content
      </a>
      <SiteNavigation
        isAdmin={officer.applicationRole === "admin"}
        academicPeriods={academicPeriods}
        recentNotifications={enrichedRecentNotifications}
        unreadNotificationCount={unreadNotifications.count ?? 0}
        account={
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm">
            <Link
              href={`/officers/${officer.id}`}
              className="group -mx-1 min-w-0 flex-1 rounded-md px-1 py-0.5 transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              title="View your profile"
            >
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium text-foreground group-hover:text-brand">
                  {officer.name}
                </span>
                {officer.applicationRole !== "officer" && (
                  <span className="shrink-0 rounded-full border border-brand-border bg-brand-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                    {officer.applicationRole}
                  </span>
                )}
              </div>
              <span className="block truncate text-xs text-muted">
                {officer.positionName}
              </span>
            </Link>
            <form action={signOut} className="w-auto max-w-full shrink-0">
              <button
                type="submit"
                className="header-control button-secondary max-w-full text-left"
              >
                Sign out
              </button>
            </form>
          </div>
        }
      />
      <div className="app-main-wrap">
        <main id="main-content" tabIndex={-1} className="protected-page-width">
          <HistoricalPeriodBanner academicPeriods={academicPeriods} />
          {children}
        </main>
      </div>
      <ScrollToTop />
      <ToastRegion />
    </div>
  );
}
