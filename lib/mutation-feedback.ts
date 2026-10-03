import type { Route } from "next";

export const mutationSuccessMessages = {
  "event-saved": "Event saved",
  "officer-saved": "Officer saved",
  "task-created": "Task created",
  "task-updated": "Task updated",
} as const;

export type MutationSuccessStatus = keyof typeof mutationSuccessMessages;

const internalOrigin = "https://cappy.invalid";

export function withSuccessNotice<T extends string>(
  href: Route<T>,
  status: MutationSuccessStatus,
): Route<T> | "/" {
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(href)
  )
    return "/";
  try {
    const url = new URL(href, internalOrigin);
    if (url.origin !== internalOrigin) return "/";
    url.searchParams.delete("feedback");
    url.searchParams.set("feedback", status);
    // The validated internal pathname is unchanged; only feedback is updated.
    return `${url.pathname}${url.search}${url.hash}` as Route<T>;
  } catch {
    return "/";
  }
}

export function successNotice(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !Object.hasOwn(mutationSuccessMessages, value)
  )
    return undefined;
  return mutationSuccessMessages[value as MutationSuccessStatus];
}
