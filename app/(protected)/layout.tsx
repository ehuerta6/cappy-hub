import SiteNavigation from "@/components/site-navigation";
import { requireCurrentOfficer } from "@/lib/current-officer";
import { signOut } from "@/app/auth/actions";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const officer = await requireCurrentOfficer();
  return (
    <>
      <SiteNavigation
        isAdmin={officer.applicationRole === "admin"}
        account={
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="truncate text-zinc-400">{officer.name}</span>
            <form action={signOut} className="w-auto shrink-0">
              <button
                type="submit"
                className="button-secondary whitespace-nowrap px-3 py-1.5"
              >
                Sign out
              </button>
            </form>
          </div>
        }
      />
      {children}
    </>
  );
}
