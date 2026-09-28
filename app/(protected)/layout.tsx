import SiteNavigation from "@/components/site-navigation";
import { requireCurrentOfficer } from "@/lib/current-officer";
import { signOut } from "@/app/auth/actions";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const officer = await requireCurrentOfficer();
  return (
    <>
      <SiteNavigation isAdmin={officer.applicationRole === "admin"} />
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-3 px-4 pt-3 text-sm text-zinc-400 sm:px-6">
        <span>{officer.name}</span>
        <form action={signOut}>
          <button type="submit" className="text-zinc-100 underline">
            Sign out
          </button>
        </form>
      </div>
      {children}
    </>
  );
}
