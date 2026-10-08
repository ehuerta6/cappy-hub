import {
  formatCalendarDate,
  formatDateTime,
  formatLabel,
} from "./presentation";

type AuditObject = Record<string, unknown>;

export type AuditEntryForPresentation = {
  action: string;
  entity_type: string;
  entity_id: string | number;
  details: unknown;
};

export type AuditPresentationContext = {
  officerNames?: ReadonlyMap<number, string>;
  eventNames?: ReadonlyMap<number, string>;
  taskNames?: ReadonlyMap<number, string>;
  availableEventIds?: ReadonlySet<number>;
  availableTaskIds?: ReadonlySet<number>;
  availableOfficerIds?: ReadonlySet<number>;
};

export type AuditPresentation = {
  activity: string;
  record: { label: string; href?: string };
  changes: Array<{ label: string; value: string }>;
  detailSummary: string;
};

type ActionPresentationKind =
  | "event-signup"
  | "event-signout"
  | "event-officer-assigned"
  | "event-officer-removed"
  | "event-officers-bulk-added"
  | "task-assigned"
  | "task-officer-added"
  | "task-officer-removed"
  | "task-completion-changed"
  | "task-completed"
  | "task-approved"
  | "officer-role-changed"
  | "points"
  | "warning";

type ActionPresentation = {
  label: string;
  kind?: ActionPresentationKind;
  pointVerb?: string;
};

const actionPresentations: Record<string, ActionPresentation> = {
  "branch.created": { label: "Created a branch" },
  "branch.deleted": { label: "Deleted a branch" },
  "branch.renamed": { label: "Renamed a branch" },
  "config.participation_rate_changed": {
    label: "Changed the participation points rate",
  },
  "event.cancelled": { label: "Cancelled an event" },
  "event.created": { label: "Created an event" },
  "event.links_updated": { label: "Updated event links" },
  "event.officer_assigned": {
    label: "Assigned an officer to an event",
    kind: "event-officer-assigned",
  },
  "event.officer_removed": {
    label: "Removed an officer from an event",
    kind: "event-officer-removed",
  },
  "event.officers_bulk_added": {
    label: "Added officers to an event",
    kind: "event-officers-bulk-added",
  },
  "event.participation_processed": { label: "Processed event participation" },
  "event.removed": { label: "Removed an event" },
  "event.archived": { label: "Archived an Event" },
  "event.restored": { label: "Restored an event" },
  "event.signout": {
    label: "Removed an event signup",
    kind: "event-signout",
  },
  "event.signup": { label: "Signed up for an event", kind: "event-signup" },
  "event.updated": { label: "Updated an event" },
  "event.series_created": { label: "Created an event series" },
  "event.series_cancel": { label: "Cancelled events in a series" },
  "event.series_edit": { label: "Updated an event series" },
  "event.series_remove": { label: "Removed events in a series" },
  "event_location.created": { label: "Created an event location" },
  "event_location.deleted": { label: "Deleted an event location" },
  "event_location.renamed": { label: "Renamed an event location" },
  "event_type.created": { label: "Created an event type" },
  "event_type.deleted": { label: "Deleted an event type" },
  "event_type.renamed": { label: "Renamed an event type" },
  "officer.auth_linked": { label: "Linked an account to an officer" },
  "officer.created": { label: "Added an officer" },
  "officer.deactivated": { label: "Deactivated an officer" },
  "officer.reactivated": { label: "Reactivated an officer" },
  "officer.role_changed": {
    label: "Changed an officer's application role",
    kind: "officer-role-changed",
  },
  "officer.updated": { label: "Updated an officer" },
  "points.correction_created": {
    label: "Recorded a points correction",
    kind: "points",
    pointVerb: "Recorded a points correction",
  },
  "points.manual_created": {
    label: "Added a points transaction",
    kind: "points",
    pointVerb: "Added points",
  },
  "points.participation_created": {
    label: "Awarded event participation points",
    kind: "points",
    pointVerb: "Awarded participation points",
  },
  "points.participation_removed": {
    label: "Removed event participation points",
    kind: "points",
    pointVerb: "Removed participation points",
  },
  "points.task_created": {
    label: "Awarded task points",
    kind: "points",
    pointVerb: "Awarded task points",
  },
  "points.task_reactivated": {
    label: "Reactivated task points",
    kind: "points",
    pointVerb: "Reactivated task points",
  },
  "points.task_removed": {
    label: "Removed task points",
    kind: "points",
    pointVerb: "Removed task points",
  },
  "points.transaction_removed": {
    label: "Removed a points transaction",
    kind: "points",
    pointVerb: "Removed a points transaction",
  },
  "points.transaction_updated": {
    label: "Updated a points transaction",
    kind: "points",
    pointVerb: "Updated a points transaction",
  },
  "position.created": { label: "Created a position" },
  "position.deleted": { label: "Deleted a position" },
  "position.renamed": { label: "Renamed a position" },
  "task.approved": {
    label: "Approved a completed task",
    kind: "task-approved",
  },
  "task.assigned": {
    label: "Assigned an officer to a task",
    kind: "task-assigned",
  },
  "task.completed": { label: "Marked a task complete", kind: "task-completed" },
  "task.created": { label: "Created a task" },
  "task.completion_changed": {
    label: "Changed task completion",
    kind: "task-completion-changed",
  },
  "task.officer_added": {
    label: "Added an officer to a task",
    kind: "task-officer-added",
  },
  "task.officer_removed": {
    label: "Removed an officer from a task",
    kind: "task-officer-removed",
  },
  "task.removed": { label: "Removed a task" },
  "task.archived": { label: "Archived a Task" },
  "task.restored": { label: "Restored a Task" },
  "task.series_created": { label: "Created a task series" },
  "task.series_cancel": { label: "Cancelled tasks in a series" },
  "task.series_edit": { label: "Updated a task series" },
  "task.series_remove": { label: "Removed tasks in a series" },
  "task.updated": { label: "Updated a task" },
  "warning.approved_by_approver": {
    label: "Approved a warning",
    kind: "warning",
  },
  "warning.created": {
    label: "Recorded a warning",
    kind: "warning",
  },
  "warning.voided": { label: "Voided a warning", kind: "warning" },
  "warning.deleted": { label: "Deleted a warning" },
  "warning.rejected_by_approver": {
    label: "Rejected a warning",
    kind: "warning",
  },
};

function activitySearchWords(value: string) {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function findAuditActionCodes(search: string) {
  const searchWords = activitySearchWords(search);
  if (searchWords.length === 0) return [];

  return Object.entries(actionPresentations)
    .filter(([action, presentation]) => {
      const activityWords = new Set([
        ...activitySearchWords(presentation.label),
        ...activitySearchWords(action),
      ]);
      return searchWords.every((word) =>
        [...activityWords].some((activityWord) =>
          activityWord.startsWith(word),
        ),
      );
    })
    .map(([action]) => action);
}

const fieldLabels: Record<string, string> = {
  application_role: "Application role",
  approval_required: "Approval required",
  branch_id: "Branch",
  branch_ids: "Branches",
  description: "Description",
  due_date: "Due date",
  ends_at: "End time",
  event_date: "Event date",
  event_type_id: "Event type",
  location: "Location",
  meeting_notes_url: "Meeting notes link",
  signup_sheet_url: "External roster / signup sheet",
  name: "Name",
  new_rate: "Participation rate",
  old_rate: "Participation rate",
  points: "Points",
  position_id: "Position",
  rate: "Participation rate",
  reason: "Reason",
  slides_url: "Slides link",
  starts_at: "Start time",
  status: "Status",
  title: "Title",
};

const hiddenChangeFields = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "deleted_at",
  "removed_at",
  "removed_by",
  "actor_id",
  "officer_id",
  "event_id",
  "task_id",
  "auth_user_id",
  "request_key",
  "revision",
]);

function asObject(value: unknown): AuditObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AuditObject)
    : undefined;
}

function readString(source: AuditObject | undefined, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readId(source: AuditObject | undefined, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isSafeInteger(value)) return value;
    if (typeof value === "string" && /^-?\d+$/.test(value)) {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
  }
  return undefined;
}

function readSnapshotId(details: AuditObject | undefined, keys: string[]) {
  return (
    readId(details, keys) ??
    readId(asObject(details?.after), keys) ??
    readId(asObject(details?.before), keys)
  );
}

function labelField(field: string) {
  return fieldLabels[field] ?? formatLabel(field);
}

function formatValue(value: unknown, field?: string) {
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") {
    if (
      (field === "event_date" || field === "due_date") &&
      /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      try {
        return formatCalendarDate(value);
      } catch {
        return value;
      }
    }
    if ((field === "starts_at" || field === "ends_at") && value.includes("T")) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return formatDateTime(value);
    }
    if (field === "status" && value.toLowerCase() === "not completed")
      return "Not completed";
    if (field === "application_role" || field === "status")
      return formatLabel(value);
    return value;
  }
  if (typeof value === "number") return String(value);
  return "updated";
}

function summarizeChanges(details: AuditObject | undefined) {
  const before = asObject(details?.before);
  const after = asObject(details?.after);
  if (before && after) {
    return Object.keys(after)
      .filter(
        (field) =>
          !hiddenChangeFields.has(field) &&
          (before[field] === null ||
            ["string", "number", "boolean", "undefined"].includes(
              typeof before[field],
            )) &&
          (after[field] === null ||
            ["string", "number", "boolean", "undefined"].includes(
              typeof after[field],
            )) &&
          JSON.stringify(before[field]) !== JSON.stringify(after[field]),
      )
      .slice(0, 4)
      .map((field) => ({
        label: labelField(field),
        value: `${formatValue(before[field], field)} → ${formatValue(after[field], field)}`,
      }));
  }
  if (
    typeof details?.old_role === "string" ||
    typeof details?.new_role === "string"
  )
    return [
      {
        label: "Application role",
        value: `${formatLabel(formatValue(details.old_role))} → ${formatLabel(formatValue(details.new_role))}`,
      },
    ];
  if (
    typeof details?.previous_status === "string" ||
    typeof details?.new_status === "string"
  )
    return [
      {
        label: "Status",
        value: `${formatLabel(formatValue(details.previous_status))} → ${formatLabel(formatValue(details.new_status))}`,
      },
    ];
  if (
    typeof details?.old_name === "string" ||
    typeof details?.new_name === "string"
  )
    return [
      {
        label: "Name",
        value: `${formatValue(details.old_name)} → ${formatValue(details.new_name)}`,
      },
    ];
  if (
    typeof details?.old_rate === "number" ||
    typeof details?.new_rate === "number"
  )
    return [
      {
        label: "Participation rate",
        value: `${formatValue(details.old_rate)} → ${formatValue(details.new_rate)}`,
      },
    ];
  return [];
}

function sentenceFor(
  presentation: ActionPresentation | undefined,
  detail: AuditObject | undefined,
  person: string | undefined,
  recordName: string,
  context: AuditPresentationContext,
) {
  const personName = person ?? "an officer";
  switch (presentation?.kind) {
    case "event-signup":
      return `${personName} signed up for ${recordName}`;
    case "event-signout":
      return `${personName} signed out of ${recordName}`;
    case "event-officer-assigned":
      return `Assigned ${personName} to ${recordName}`;
    case "event-officer-removed":
      return `Removed ${personName} from ${recordName}`;
    case "event-officers-bulk-added": {
      const ids = Array.isArray(detail?.officer_ids) ? detail.officer_ids : [];
      const names = ids
        .map((id) => (typeof id === "number" ? id : Number(id)))
        .filter(Number.isSafeInteger)
        .map((id) => context.officerNames?.get(id))
        .filter((name): name is string => typeof name === "string");
      if (names.length > 0)
        return `Added ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} others` : ""} to ${recordName}`;
      return `${presentation.label} (${ids.length} ${ids.length === 1 ? "officer" : "officers"})`;
    }
    case "task-assigned":
      return `Assigned ${personName} to ${recordName}`;
    case "task-officer-added":
      return `Added ${personName} to ${recordName}`;
    case "task-officer-removed":
      return `Removed ${personName} from ${recordName}`;
    case "task-completion-changed":
      return readString(asObject(detail?.after), ["status"]) === "Completed"
        ? `Marked ${personName}'s assignment complete for ${recordName}`
        : `Marked ${personName}'s assignment not completed for ${recordName}`;
    case "task-completed":
      return `${personName} completed ${recordName}`;
    case "task-approved":
      return `${recordName} was approved for ${personName}`;
    case "officer-role-changed":
      return `Changed ${readString(detail, ["officer_name"]) ?? personName}'s application role`;
    case "points": {
      const points =
        detail?.points ??
        asObject(detail?.after)?.points ??
        asObject(detail?.before)?.points;
      const verb = presentation.pointVerb ?? "Updated points";
      return `${verb}${points !== undefined ? ` (${formatValue(points)} points)` : ""} for ${personName}${recordName ? ` · ${recordName}` : ""}`;
    }
    case "warning":
      return `${presentation.label} for ${readString(detail, ["officer_name"]) ?? personName}`;
    default: {
      if (presentation)
        return `${presentation.label}${recordName ? ` · ${recordName}` : ""}`;
      return "Recorded an activity with an unrecognized action";
    }
  }
}

function detailSummaryFor(
  presentation: ActionPresentation | undefined,
  details: AuditObject | undefined,
  officerName: string | undefined,
  fallback: string,
) {
  switch (presentation?.kind) {
    case "event-signup":
      return `${officerName ?? "Officer"} signed up`;
    case "event-signout":
      return `${officerName ?? "Officer"} signed out`;
    case "event-officer-assigned":
    case "task-assigned":
      return `Assigned to ${officerName ?? "Officer"}`;
    case "event-officer-removed":
    case "task-officer-removed":
      return `Removed ${officerName ?? "Officer"}`;
    case "task-officer-added":
      return `Added ${officerName ?? "Officer"}`;
    case "task-completion-changed":
      return `${readString(asObject(details?.after), ["status"]) ?? "Updated"} for ${officerName ?? "Officer"}`;
    case "task-completed":
      return `Completed by ${officerName ?? "Officer"}`;
    case "task-approved":
      return `Approved for ${officerName ?? "Officer"}`;
    case "event-officers-bulk-added":
      if (Array.isArray(details?.officer_ids))
        return `${details.officer_ids.length} ${details.officer_ids.length === 1 ? "officer" : "officers"} added`;
      return fallback;
    default:
      return fallback;
  }
}

export function presentAuditEntry(
  entry: AuditEntryForPresentation,
  context: AuditPresentationContext = {},
): AuditPresentation {
  const details = asObject(entry.details);
  const actionPresentation = actionPresentations[entry.action];
  const before = asObject(details?.before);
  const after = asObject(details?.after);
  const snapshots = [after, before];
  const entityId = String(entry.entity_id);
  const parsedEntityId = readId({ id: entityId }, ["id"]);
  const officerId = readSnapshotId(details, [
    "officer_id",
    "target_officer_id",
  ]);
  const officerName =
    readString(details, ["officer_name", "target_officer_name"]) ??
    snapshots
      .map((snapshot) => readString(snapshot, ["officer_name"]))
      .find(Boolean) ??
    (officerId === undefined
      ? undefined
      : (context.officerNames?.get(officerId) ?? `Officer #${officerId}`));
  const actionEntityType = entry.entity_type;

  let recordName: string | undefined;
  let href: string | undefined;
  if (actionEntityType === "event") {
    recordName =
      readString(details, ["event_name", "name"]) ??
      snapshots
        .map((snapshot) => readString(snapshot, ["name"]))
        .find(Boolean) ??
      (parsedEntityId === undefined
        ? undefined
        : context.eventNames?.get(parsedEntityId));
    if (
      parsedEntityId !== undefined &&
      context.availableEventIds?.has(parsedEntityId)
    )
      href = `/events/${parsedEntityId}`;
  } else if (actionEntityType === "task") {
    recordName =
      readString(details, ["task_title", "title"]) ??
      snapshots
        .map((snapshot) => readString(snapshot, ["title"]))
        .find(Boolean) ??
      (parsedEntityId === undefined
        ? undefined
        : context.taskNames?.get(parsedEntityId));
    if (
      parsedEntityId !== undefined &&
      context.availableTaskIds?.has(parsedEntityId)
    )
      href = `/tasks/${parsedEntityId}`;
  } else if (actionEntityType === "officer") {
    recordName =
      readString(details, ["officer_name", "name"]) ??
      snapshots
        .map((snapshot) => readString(snapshot, ["name"]))
        .find(Boolean) ??
      (parsedEntityId === undefined
        ? undefined
        : context.officerNames?.get(parsedEntityId));
    if (
      parsedEntityId !== undefined &&
      context.availableOfficerIds?.has(parsedEntityId)
    )
      href = `/officers/${parsedEntityId}`;
  } else if (actionEntityType === "point_transaction") {
    const eventId = readSnapshotId(details, ["event_id"]);
    const taskId = readSnapshotId(details, ["task_id"]);
    const relatedOfficerId = readSnapshotId(details, ["officer_id"]);
    recordName =
      readString(details, ["event_name", "task_title"]) ??
      snapshots
        .map((snapshot) => readString(snapshot, ["event_name", "task_title"]))
        .find(Boolean) ??
      (eventId === undefined ? undefined : context.eventNames?.get(eventId)) ??
      (taskId === undefined ? undefined : context.taskNames?.get(taskId)) ??
      readString(details, ["reason"]) ??
      (relatedOfficerId === undefined
        ? undefined
        : context.officerNames?.get(relatedOfficerId));
    if (eventId !== undefined && context.availableEventIds?.has(eventId))
      href = `/events/${eventId}`;
    else if (taskId !== undefined && context.availableTaskIds?.has(taskId))
      href = `/tasks/${taskId}`;
  } else if (actionEntityType === "event_series") {
    const selectedEventId = readId(details, ["selected_occurrence_id"]);
    recordName =
      (selectedEventId === undefined
        ? undefined
        : context.eventNames?.get(selectedEventId)) ??
      readString(details, ["name"]);
    if (
      selectedEventId !== undefined &&
      context.availableEventIds?.has(selectedEventId)
    )
      href = `/events/${selectedEventId}`;
  } else if (actionEntityType === "task_series") {
    const selectedTaskId = readId(details, ["selected_occurrence_id"]);
    recordName =
      (selectedTaskId === undefined
        ? undefined
        : context.taskNames?.get(selectedTaskId)) ??
      readString(details, ["title"]);
    if (
      selectedTaskId !== undefined &&
      context.availableTaskIds?.has(selectedTaskId)
    )
      href = `/tasks/${selectedTaskId}`;
  } else if (actionEntityType === "application_config") {
    recordName = "Participation points configuration";
  } else {
    recordName =
      readString(details, [
        "officer_name",
        "name",
        "title",
        "location_name",
        "new_name",
        "old_name",
      ]) ??
      (officerId === undefined
        ? undefined
        : context.officerNames?.get(officerId)) ??
      snapshots
        .map((snapshot) =>
          readString(snapshot, ["name", "title", "location_name"]),
        )
        .find(Boolean);
  }

  const recordType = formatLabel(actionEntityType.replaceAll("_", " "));
  const fallbackRecord = `${recordType} #${entityId}`;
  const label = recordName ?? fallbackRecord;
  const changes = summarizeChanges(details);
  let detailSummary =
    changes.length > 0
      ? changes
          .map(({ label: field, value }) => `${field}: ${value}`)
          .join(" · ")
      : (readString(details, ["reason", "note", "operation"]) ??
        (actionPresentation
          ? actionPresentation.label
          : "Additional audit data recorded"));
  detailSummary = detailSummaryFor(
    actionPresentation,
    details,
    officerName,
    detailSummary,
  );

  return {
    activity: sentenceFor(
      actionPresentation,
      details,
      officerName,
      label,
      context,
    ),
    record: { label, href },
    changes,
    detailSummary,
  };
}
