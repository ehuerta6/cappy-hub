import type { ListRoute } from "@/lib/return-context";

export function listPageUrl(
  pathname: Extract<ListRoute, "/points" | "/system-log">,
  filters: URLSearchParams,
  page: number,
) {
  const search = new URLSearchParams(filters);
  if (page > 1) search.set("page", String(page));
  else search.delete("page");
  const query = search.toString();
  return query ? (`${pathname}?${query}` as const) : pathname;
}
