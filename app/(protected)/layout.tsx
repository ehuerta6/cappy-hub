import SiteNavigation from "@/components/site-navigation";
import { requireCurrentOfficer } from "@/lib/current-officer";
import { signOut } from "@/app/auth/actions";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const officer = await requireCurrentOfficer();
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:not-sr-only focus:rounded-md focus:border focus:border-border-strong focus:bg-surface focus:px-3 focus:py-2 focus:text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-muted"
      >
        Skip to content
      </a>
      <SiteNavigation
        isAdmin={officer.applicationRole === "admin"}
        account={
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="min-w-28 flex-1 break-words text-muted">
              {officer.name}
            </span>
            <form action={signOut} className="w-auto max-w-full shrink-0">
              <button
                type="submit"
                className="button-secondary min-h-11 max-w-full whitespace-normal break-words px-3 py-2 text-left lg:min-h-0 lg:py-1.5"
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
