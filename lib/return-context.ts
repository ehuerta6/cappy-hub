import type { ReactNode } from "react";

export type NavigationSearchParams = Record<
  string,
  string | string[] | undefined
>;

const listRoutes = {
  "/officers": ["q", "status", "position", "branch"],
  "/events": ["q", "status", "type", "branch", "removed"],
  "/tasks": ["q", "status", "branch", "assignee"],
  "/points": ["q", "type", "officer", "event", "status", "from", "to", "page"],
  "/system-log": ["q", "actor", "action", "entity", "from", "to", "page"],
} as const;

export type ListRoute = keyof typeof listRoutes;

// Accept only literal list paths, never arbitrary redirect destinations. Query
// values are data; decode once to reject malformed percent encoding as well.
export function safeReturnTo(value: unknown): string | undefined {
  if (typeof value !== "string" || /[\\#\s\u0000-\u001f\u007f]/.test(value))
    return undefined;
  try {
    decodeURIComponent(value);
    const [pathname] = value.split("?");
    if (!Object.hasOwn(listRoutes, pathname)) return undefined;
    const url = new URL(value, "https://cappy.invalid");
    if (url.pathname !== pathname || url.origin !== "https://cappy.invalid")
      return undefined;
    // A return destination is always a list, never another contextual link.
    if (url.searchParams.has("returnTo")) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

// Copy only URL state understood by the originating list. In particular, never
// wrap an incoming returnTo into another returnTo.
export function listReturnUrl(
  pathname: ListRoute,
  params: NavigationSearchParams,
): string {
  const search = new URLSearchParams();
  for (const key of listRoutes[pathname]) {
    const value = params[key];
    if (typeof value === "string" && value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function withReturnTo(href: string, value: unknown): string {
  const destination = safeReturnTo(value);
  const url = new URL(href, "https://cappy.invalid");
  url.searchParams.delete("returnTo");
  if (destination) url.searchParams.set("returnTo", destination);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function returnLinkLabel(
  destination: string,
  fallback: ReactNode,
): ReactNode {
  const pathname = destination.split("?")[0];
  const labels: Record<ListRoute, string> = {
    "/officers": "Back to officers",
    "/events": "Back to events",
    "/tasks": "Back to tasks",
    "/points": "Back to points",
    "/system-log": "Back to System Log",
  };
  return labels[pathname as ListRoute] ?? fallback;
}
