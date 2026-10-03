// PostgreSQL's case-insensitive regex operator matches substrings. Escaping
// every regex metacharacter keeps search literal, including * (which PostgREST
// rewrites to % for LIKE operators even when it is escaped).
export function literalSearchPattern(search: string) {
  return search.replaceAll("\0", "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function searchOrFilter(search: string, columns: readonly string[]) {
  const pattern = literalSearchPattern(search)
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
  return columns.map((column) => `${column}.imatch."${pattern}"`).join(",");
}
