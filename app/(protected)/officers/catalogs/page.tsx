import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListPagination } from "@/components/list-pagination";
import { PageHeader } from "@/components/ui";
import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import CatalogManager, { type CatalogRecord } from "./manager";
import {
  CATALOG_CATEGORIES,
  catalogUrl,
  selectedCatalogCategory,
  selectedCatalogPage,
  type CatalogSearchParams,
} from "./navigation";

const CATALOGS_PER_PAGE = 8;

export default async function OfficerCatalogsPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) notFound();

  const params = await searchParams;
  const category = selectedCatalogCategory(params.category);
  const requestedPage = selectedCatalogPage(params.page);
  const categoryDefinition = CATALOG_CATEGORIES.find(
    (item) => item.value === category,
  )!;
  const supabase = await createClient();
  const table = categoryDefinition.table;

  const countResult = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (countResult.error) throw new Error("Could not load catalog count");
  const totalCount = countResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / CATALOGS_PER_PAGE));
  const page = Math.min(requestedPage, totalPages);

  if (
    params.category !== category ||
    (params.page !== undefined &&
      (typeof params.page !== "string" ||
        String(page) !== params.page ||
        page === 1))
  ) {
    redirect(catalogUrl(category, page));
  }

  const start = (page - 1) * CATALOGS_PER_PAGE;
  const end = page * CATALOGS_PER_PAGE - 1;
  let records: CatalogRecord[] | null;
  let hasRecordsError: boolean;
  if (categoryDefinition.catalog === "position") {
    const result = await supabase
      .from("positions")
      .select("id,name,code,is_active")
      .order("name")
      .order("id")
      .range(start, end);
    records = result.data;
    hasRecordsError = result.error !== null;
  } else if (categoryDefinition.catalog === "branch") {
    const result = await supabase
      .from("branches")
      .select("id,name,is_active")
      .order("name")
      .order("id")
      .range(start, end);
    records = result.data;
    hasRecordsError = result.error !== null;
  } else {
    const result = await supabase
      .from("event_locations")
      .select("id,name")
      .order("name")
      .order("id")
      .range(start, end);
    records = result.data;
    hasRecordsError = result.error !== null;
  }
  if (hasRecordsError || !records)
    throw new Error("Could not load catalog records");

  const filters = new URLSearchParams({ category });
  return (
    <div className="space-y-5">
      <PageHeader
        title="Officer catalogs"
        description="Manage officer positions, branches and reusable Event locations."
      />
      <p className="text-sm text-muted">
        The six baseline positions are required. Retired branches and custom
        positions remain readable in history but cannot be newly assigned.
        Referenced records cannot be deleted; renaming and retirement retain
        their IDs and relationships.
      </p>
      <nav aria-label="Catalog categories" className="catalog-category-nav">
        {CATALOG_CATEGORIES.map((item) => (
          <Link
            key={item.value}
            href={catalogUrl(item.value)}
            aria-current={item.value === category ? "page" : undefined}
            className={
              item.value === category
                ? "catalog-category-link catalog-category-link-active"
                : "catalog-category-link"
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <section aria-labelledby="catalog-category-heading" className="space-y-3">
        <CatalogManager
          catalog={categoryDefinition.catalog}
          title={categoryDefinition.label}
          records={records}
        />
        {records.length === 0 ? (
          <p className="text-sm text-muted">
            No {categoryDefinition.label.toLowerCase()} yet.
          </p>
        ) : (
          <ListPagination
            pathname="/officers/catalogs"
            label={categoryDefinition.label}
            filters={filters}
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            countLabel={totalCount === 1 ? "record" : "records"}
            getPageHref={(targetPage) => catalogUrl(category, targetPage)}
          />
        )}
      </section>
    </div>
  );
}
