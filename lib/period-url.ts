import type { Route } from "next";

/**
 * Appends the active `period` query parameter (if present) to an internal route.
 */
export function withPeriodParam<T extends string>(
  href: T,
  periodQuery: string | null | undefined,
): Route {
  if (!periodQuery) return href as Route;
  const [pathname, existingQuery] = href.split("?");
  const params = new URLSearchParams(existingQuery ?? "");
  params.set("period", periodQuery);
  return `${pathname}?${params.toString()}` as Route;
}
