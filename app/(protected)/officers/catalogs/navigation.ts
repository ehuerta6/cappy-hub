export const CATALOG_CATEGORIES = [
  {
    value: "positions",
    label: "Positions",
    catalog: "position",
    table: "positions",
  },
  {
    value: "branches",
    label: "Branches",
    catalog: "branch",
    table: "branches",
  },
  {
    value: "locations",
    label: "Event Locations",
    catalog: "event_location",
    table: "event_locations",
  },
  {
    value: "types",
    label: "Event Types",
    catalog: "event_type",
    table: "event_types",
  },
  {
    value: "task-types",
    label: "Task Types",
    catalog: "task_type",
    table: "task_types",
  },
] as const;

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number]["value"];

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

export function selectedCatalogCategory(
  value: string | string[] | undefined,
): CatalogCategory {
  return CATALOG_CATEGORIES.some((category) => category.value === value)
    ? (value as CatalogCategory)
    : "positions";
}

export function catalogUrl(
  category: CatalogCategory,
  status: "active" | "deleted" = "active",
) {
  const params = new URLSearchParams();
  params.set("category", category);
  if (status === "deleted") params.set("status", status);
  return `/officers/catalogs?${params.toString()}` as const;
}
