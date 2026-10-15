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

export function selectedCatalogPage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

export function catalogUrl(category: CatalogCategory, page = 1) {
  const params = new URLSearchParams();
  params.set("category", category);
  if (page > 1) params.set("page", String(page));
  return `/officers/catalogs?${params.toString()}` as const;
}
