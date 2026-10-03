export function listPageUrl(
  pathname: string,
  filters: URLSearchParams,
  page: number,
) {
  const search = new URLSearchParams(filters);
  if (page > 1) search.set("page", String(page));
  else search.delete("page");
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}
