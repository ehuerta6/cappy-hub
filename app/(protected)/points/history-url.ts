export type PointHistoryFilterKey =
  "q" | "type" | "officer" | "event" | "status" | "from" | "to";

export function pointHistoryUrl(
  pathname: string,
  currentSearch: string,
  updates: Partial<Record<PointHistoryFilterKey, string>> = {},
  page?: number,
) {
  const nextSearch = new URLSearchParams(currentSearch);
  for (const [filterKey, filterValue] of Object.entries(updates)) {
    if (filterValue) nextSearch.set(filterKey, filterValue);
    else nextSearch.delete(filterKey);
  }
  if (page !== undefined) nextSearch.set("page", String(page));
  else if (Object.keys(updates).length > 0) nextSearch.set("page", "1");
  const query = nextSearch.toString();
  return query ? `${pathname}?${query}` : pathname;
}
