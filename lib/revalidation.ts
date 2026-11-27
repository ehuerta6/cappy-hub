import { revalidatePath } from "next/cache";

/**
 * Granular revalidation helpers that invalidate only the affected routes
 * instead of purging the entire root layout on every mutation.
 */

export function revalidateEventPaths(eventId?: number) {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/calendar");
  revalidatePath("/points");
  revalidatePath("/notifications");
  if (eventId !== undefined) revalidatePath(`/events/${eventId}`);
}

export function revalidateTaskPaths(taskId?: number) {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/points");
  revalidatePath("/notifications");
  revalidatePath("/events/[id]", "page");
  if (taskId !== undefined) revalidatePath(`/tasks/${taskId}`);
}

export function revalidatePointPaths(officerId?: number) {
  revalidatePath("/");
  revalidatePath("/points");
  revalidatePath("/officers");
  revalidatePath("/notifications");
  if (officerId !== undefined) revalidatePath(`/officers/${officerId}`);
}

export function revalidateOfficerPaths(officerId?: number) {
  revalidatePath("/");
  revalidatePath("/officers");
  revalidatePath("/points");
  revalidatePath("/notifications");
  if (officerId !== undefined) revalidatePath(`/officers/${officerId}`);
}

export function revalidateNotificationPaths() {
  revalidatePath("/");
  revalidatePath("/notifications");
}

export function revalidateCatalogPaths() {
  revalidatePath("/officers/catalogs");
  revalidatePath("/officers");
  revalidatePath("/events");
  revalidatePath("/tasks");
}

export function revalidatePeriodPaths() {
  // Academic period options live in ProtectedLayout's header selector and affect all routes.
  revalidatePath("/", "layout");
}
