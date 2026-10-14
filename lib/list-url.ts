import type { ListRoute } from "@/lib/return-context";

export function listPageUrl(
  pathname: Extract<
    ListRoute,
    "/events" | "/officers" | "/points" | "/system-log" | "/tasks"
  >,
  filters: URLSearchParams,
  page: number,
  pageParam: "page" | "rankPage" | "reviewPage" = "page",
) {
  const search = new URLSearchParams(filters);
  if (page > 1) search.set(pageParam, String(page));
  else search.delete(pageParam);
  const query = search.toString();
  return query ? (`${pathname}?${query}` as const) : pathname;
}
