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
    title: "Positions and branches",
    description:
      "Manage the club structure used by officer records and branch-scoped work.",
    href: "/officers/catalogs",
    link: "Manage positions and branches",
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
      <div className="grid grid-cols-2 gap-x-8">
        {adminAreas.map((area) => (
          <section
            key={area.href}
            className="flex flex-col items-start gap-2 border-t border-border py-4 first:border-0 first:pt-0 sm:[&:nth-child(2)]:border-0"
          >
            <h2 className="font-semibold">{area.title}</h2>
            <p className="text-sm">{area.description}</p>
            <Link
              className="text-sm font-medium text-foreground underline"
              href={area.href}
            >
              {area.link}
            </Link>
          </section>
        ))}
      </div>
    </div>
  );
}
