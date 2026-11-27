import { revalidatePath } from "next/cache";

/**
 * Domain revalidation helpers.
 *
 * Mutations that can create or update notifications, active officer state, or
 * academic periods invalidate `("/", "layout")` so ProtectedLayout's shared
 * header (notification preview/count and period selector) stays current, while
 * also invalidating the specific entity detail route when an ID is known.
 */

export function revalidateEventPaths(eventId?: number) {
  revalidatePath("/", "layout");
  revalidatePath("/events");
  revalidatePath("/calendar");
  revalidatePath("/points");
  if (eventId !== undefined) revalidatePath(`/events/${eventId}`);
}

export function revalidateTaskPaths(taskId?: number) {
  revalidatePath("/", "layout");
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/points");
  revalidatePath("/events/[id]", "page");
  if (taskId !== undefined) revalidatePath(`/tasks/${taskId}`);
}

export function revalidatePointPaths(officerId?: number) {
  revalidatePath("/", "layout");
  revalidatePath("/points");
  revalidatePath("/officers");
  if (officerId !== undefined) revalidatePath(`/officers/${officerId}`);
}

export function revalidateOfficerPaths(officerId?: number) {
  revalidatePath("/", "layout");
  revalidatePath("/officers");
  revalidatePath("/points");
  if (officerId !== undefined) revalidatePath(`/officers/${officerId}`);
}

export function revalidateNotificationPaths() {
  revalidatePath("/", "layout");
  revalidatePath("/notifications");
}

export function revalidateCatalogPaths() {
  // Catalog updates do not mutate notifications or ProtectedLayout header data.
  revalidatePath("/officers/catalogs");
  revalidatePath("/officers");
  revalidatePath("/events");
  revalidatePath("/tasks");
}

export function revalidatePeriodPaths() {
  revalidatePath("/", "layout");
}
