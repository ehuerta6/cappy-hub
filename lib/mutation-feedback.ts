export const mutationSuccessMessages = {
  "event-saved": "Event saved",
  "officer-saved": "Officer saved",
  "task-created": "Task created",
  "task-updated": "Task updated",
} as const;

export type MutationSuccessStatus = keyof typeof mutationSuccessMessages;

const internalOrigin = "https://cappy.invalid";

export function withSuccessNotice(
  href: string,
  status: MutationSuccessStatus,
): string {
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
    return `${url.pathname}${url.search}${url.hash}`;
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
