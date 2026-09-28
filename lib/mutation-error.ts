// Database constraint details are useful in logs, but not in form responses.
const safeMessages = new Set([
  "Admin required",
  "Unauthorized",
  "Officer not found",
  "Event not found",
  "Event outside branch scope",
  "Only upcoming events can be edited",
  "This event cannot be cancelled",
  "Cannot manage another officer signup for this event",
  "Signups are closed for this event",
  "Target officer is not active",
  "Last active admin cannot be deactivated",
]);

export function mutationError(message: string) {
  return safeMessages.has(message) ? message : "Could not save changes";
}
