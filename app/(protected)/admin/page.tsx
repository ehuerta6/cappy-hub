import { PageHeader } from "@/components/ui";
import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

const adminAreas = [
  {
    title: "Officer access",
    description:
      "Manage application roles and officer warnings from an officer’s profile. Officer records and everyday workflows remain in Officers.",
    href: "/officers",
    link: "Manage officers",
  },
  {
    title: "Catalogs",
    description:
      "Manage the club values used by Officers, Events, Tasks and branch-scoped work.",
    href: "/officers/catalogs",
    link: "Manage catalogs",
  },
  {
    title: "Points configuration and corrections",
    description:
      "Update the participation points rate, add manual corrections, or review and remove point awards.",
    href: "/points",
    link: "Open points administration",
  },
  {
    title: "System log",
    description:
      "Review the audit history for application administration and other recorded changes.",
    href: "/system-log",
    link: "View system log",
  },
] as const satisfies readonly {
  title: string;
  description: string;
  href: Route;
  link: string;
}[];

export default async function AdminPage() {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) notFound();

  return (
    <div data-page-width="wide" className="space-y-5">
      <PageHeader
        title="Admin"
        description="Application-wide administration for Coding Interview Club."
      />
      <nav aria-label="Administration areas">
        <ul className="grid grid-cols-2 gap-4">
          {adminAreas.map((area) => (
            <li key={area.href} className="min-w-0">
              <Link
                className="group flex h-full min-h-11 flex-col items-start gap-1.5 rounded-md border border-border bg-surface/30 px-4 py-3 hover:border-border-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
                href={area.href}
              >
                <h2 className="font-semibold text-foreground group-hover:underline group-hover:underline-offset-4">
                  {area.title}
                </h2>
                <span className="text-sm text-muted">{area.description}</span>
                <span className="text-sm font-medium text-foreground underline underline-offset-4">
                  {area.link}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
