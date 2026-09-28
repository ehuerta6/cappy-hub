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
  "Admins cannot demote themselves",
  "Last active admin cannot be demoted",
  "Position name is required",
  "Branch name is required",
  "Event type name is required",
  "Position not found",
  "Branch not found",
  "Event type not found",
  "Required positions cannot be renamed",
  "Required positions cannot be deleted",
  "This position cannot be deleted because officers are using it",
  "This branch cannot be deleted because officers or events are using it",
  "This event type cannot be deleted because events are using it",
]);

export function mutationError(message: string) {
  return safeMessages.has(message) ? message : "Could not save changes";
}
