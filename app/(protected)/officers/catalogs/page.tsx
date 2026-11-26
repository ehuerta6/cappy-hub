import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ContextualBackLink from "@/components/contextual-back-link";
import { PageHeader } from "@/components/ui";
import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import CatalogManager, { type CatalogRecord } from "./manager";
import {
  CATALOG_CATEGORIES,
  catalogUrl,
  selectedCatalogCategory,
  type CatalogSearchParams,
} from "./navigation";

export default async function OfficerCatalogsPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) notFound();

  const params = await searchParams;
  const periodData = await getAcademicPeriodData();
  const periodSelection = resolveAcademicPeriod(params.period, periodData);
  const contextHref = (href: string) => {
    const period = Array.isArray(params.period)
      ? params.period[0]
      : params.period;
    if (!period) return href as import("next").Route;
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}period=${encodeURIComponent(period)}` as import("next").Route;
  };
  const category = selectedCatalogCategory(params.category);
  const status = params.status === "deleted" ? "deleted" : "active";
  const categoryDefinition = CATALOG_CATEGORIES.find(
    (item) => item.value === category,
  )!;
  const supabase = await createClient();
  if (
    params.category !== category ||
    (params.status !== undefined && params.status !== "deleted") ||
    params.page !== undefined
  ) {
    redirect(contextHref(catalogUrl(category, 1, status)));
  }

  const isActiveStatus = status === "active";
  const [
    positionsCount,
    branchesCount,
    eventTypesCount,
    taskTypesCount,
    locationsCount,
    recordsResult,
  ] = await Promise.all([
    supabase
      .from("positions")
      .select("id", { count: "exact", head: true })
      .eq("is_active", isActiveStatus),
    supabase
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("is_active", isActiveStatus),
    supabase
      .from("event_types")
      .select("id", { count: "exact", head: true })
      .eq("available_for_new_events", isActiveStatus),
    supabase
      .from("task_types")
      .select("id", { count: "exact", head: true })
      .eq("available_for_new_tasks", isActiveStatus),
    supabase
      .from("event_locations")
      .select("id", { count: "exact", head: true })
      .eq("is_active", isActiveStatus),
    categoryDefinition.catalog === "position"
      ? supabase
          .from("positions")
          .select("id,name,code,is_active")
          .eq("is_active", isActiveStatus)
          .order("name")
          .order("id")
      : categoryDefinition.catalog === "branch"
        ? supabase
            .from("branches")
            .select("id,name,color,is_active")
            .eq("is_active", isActiveStatus)
            .order("name")
            .order("id")
        : categoryDefinition.catalog === "event_type"
          ? supabase
              .from("event_types")
              .select("id,name,color,available_for_new_events")
              .eq("available_for_new_events", isActiveStatus)
              .order("name")
              .order("id")
          : categoryDefinition.catalog === "task_type"
            ? supabase
                .from("task_types")
                .select("id,name,color,available_for_new_tasks")
                .eq("available_for_new_tasks", isActiveStatus)
                .order("name")
                .order("id")
            : supabase
                .from("event_locations")
                .select("id,name,is_active")
                .eq("is_active", isActiveStatus)
                .order("name")
                .order("id"),
  ]);

  const records = recordsResult.data as CatalogRecord[] | null;
  const hasRecordsError = recordsResult.error !== null;
  if (hasRecordsError || !records)
    throw new Error("Could not load catalog records");

  const countsByCatalog: Record<string, number | null> = {
    position: positionsCount.count,
    branch: branchesCount.count,
    event_type: eventTypesCount.count,
    task_type: taskTypesCount.count,
    event_location: locationsCount.count,
  };

  return (
    <div data-page-width="wide" data-nav-page="admin" className="space-y-5">
      <ContextualBackLink href={contextHref("/admin")}>
        Back to Admin
      </ContextualBackLink>
      <PageHeader
        title="Officer catalogs"
        description="Manage Positions, Branches, Event Types, Task Types and reusable Event locations."
      />
      <p className="text-sm text-muted">
        Required system Positions are protected. Deleted values stay readable on
        existing records and can be restored. Existing retired or unavailable
        values appear in Deleted without changing their history.
      </p>
      <nav aria-label="Catalog categories" className="catalog-category-nav">
        {CATALOG_CATEGORIES.map((item) => {
          const count = countsByCatalog[item.catalog];
          return (
            <Link
              key={item.value}
              href={contextHref(catalogUrl(item.value, 1, status))}
              aria-current={item.value === category ? "page" : undefined}
              className={
                item.value === category
                  ? "catalog-category-link catalog-category-link-active"
                  : "catalog-category-link"
              }
            >
              {item.label}
              {count !== null && count !== undefined ? ` (${count})` : ""}
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Catalog status" className="flex gap-4 text-sm">
        <Link
          href={contextHref(catalogUrl(category))}
          aria-current={status === "active" ? "page" : undefined}
        >
          Active values
        </Link>
        <Link
          href={contextHref(catalogUrl(category, 1, "deleted"))}
          aria-current={status === "deleted" ? "page" : undefined}
        >
          Deleted values
        </Link>
      </nav>
      <section aria-labelledby="catalog-category-heading" className="space-y-3">
        <CatalogManager
          catalog={categoryDefinition.catalog}
          title={categoryDefinition.label}
          records={records}
          showCreate={status === "active"}
          readOnly={periodSelection.isHistorical}
        />
        {records.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-8 text-center text-sm text-muted">
            No {status === "deleted" ? "deleted " : ""}
            {categoryDefinition.label.toLowerCase()} yet.
          </p>
        ) : null}
      </section>
    </div>
  );
}
