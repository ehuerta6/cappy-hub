import SiteNavigation from "@/components/site-navigation";
import { requireCurrentOfficer } from "@/lib/current-officer";
import { signOut } from "@/app/auth/actions";
import { getAcademicPeriodData } from "@/lib/academic-periods";
import { createClient } from "@/lib/supabase/server";
import NotificationReviewTracker from "@/components/notification-review-tracker";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const officer = await requireCurrentOfficer();
  const academicPeriods = await getAcademicPeriodData();
  const supabase = await createClient();
  const [recentNotifications, unreadNotifications] = await Promise.all([
    supabase
      .from("notifications")
      .select("id,title,message,created_at,read_at")
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
  return (
    <>
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
        recentNotifications={recentNotifications.data}
        unreadNotificationCount={unreadNotifications.count ?? 0}
        account={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="min-w-28 flex-1 break-words text-muted">
              {officer.name}
            </span>
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
      <main id="main-content" tabIndex={-1} className="protected-page-width">
        {children}
      </main>
    </>
  );
}
