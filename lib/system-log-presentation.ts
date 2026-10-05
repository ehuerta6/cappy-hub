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

const knownActions: Record<string, string> = {
  "branch.created": "Created a branch",
  "branch.deleted": "Deleted a branch",
  "branch.renamed": "Renamed a branch",
  "config.participation_rate_changed": "Changed the participation points rate",
  "event.cancelled": "Cancelled an event",
  "event.created": "Created an event",
  "event.links_updated": "Updated event links",
  "event.officer_assigned": "Assigned an officer to an event",
  "event.officer_removed": "Removed an officer from an event",
  "event.officers_bulk_added": "Added officers to an event",
  "event.participation_processed": "Processed event participation",
  "event.removed": "Removed an event",
  "event.restored": "Restored an event",
  "event.signout": "Removed an event signup",
  "event.signup": "Signed up for an event",
  "event.updated": "Updated an event",
  "event.series_created": "Created an event series",
  "event.series_cancel": "Cancelled events in a series",
  "event.series_edit": "Updated an event series",
  "event.series_remove": "Removed events in a series",
  "event_location.created": "Created an event location",
  "event_location.deleted": "Deleted an event location",
  "event_location.renamed": "Renamed an event location",
  "event_type.created": "Created an event type",
  "event_type.deleted": "Deleted an event type",
  "event_type.renamed": "Renamed an event type",
  "officer.auth_linked": "Linked an account to an officer",
  "officer.created": "Added an officer",
  "officer.deactivated": "Deactivated an officer",
  "officer.reactivated": "Reactivated an officer",
  "officer.role_changed": "Changed an officer's application role",
  "officer.updated": "Updated an officer",
  "points.correction_created": "Recorded a points correction",
  "points.manual_created": "Added a points transaction",
  "points.participation_created": "Awarded event participation points",
  "points.participation_removed": "Removed event participation points",
  "points.task_created": "Awarded task points",
  "points.task_reactivated": "Reactivated task points",
  "points.task_removed": "Removed task points",
  "points.transaction_removed": "Removed a points transaction",
  "points.transaction_updated": "Updated a points transaction",
  "position.created": "Created a position",
  "position.deleted": "Deleted a position",
  "position.renamed": "Renamed a position",
  "task.approved": "Approved a completed task",
  "task.assigned": "Assigned an officer to a task",
  "task.completed": "Marked a task complete",
  "task.created": "Created a task",
  "task.completion_changed": "Changed task completion",
  "task.officer_added": "Added an officer to a task",
  "task.officer_removed": "Removed an officer from a task",
  "task.removed": "Removed a task",
  "task.series_created": "Created a task series",
  "task.series_cancel": "Cancelled tasks in a series",
  "task.series_edit": "Updated a task series",
  "task.series_remove": "Removed tasks in a series",
  "task.updated": "Updated a task",
  "warning.approved_by_approver": "Approved a warning",
  "warning.created": "Recorded a warning",
  "warning.deleted": "Deleted a warning",
  "warning.rejected_by_approver": "Rejected a warning",
};

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

const pointActionVerbs: Record<string, string> = {
  "points.manual_created": "Added points",
  "points.correction_created": "Recorded a points correction",
  "points.participation_created": "Awarded participation points",
  "points.participation_removed": "Removed participation points",
  "points.task_created": "Awarded task points",
  "points.task_reactivated": "Reactivated task points",
  "points.task_removed": "Removed task points",
  "points.transaction_removed": "Removed a points transaction",
  "points.transaction_updated": "Updated a points transaction",
};

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
  entry: AuditEntryForPresentation,
  detail: AuditObject | undefined,
  person: string | undefined,
  recordName: string,
  context: AuditPresentationContext,
) {
  const personName = person ?? "an officer";
  switch (entry.action) {
    case "event.signup":
      return `${personName} signed up for ${recordName}`;
    case "event.signout":
      return `${personName} signed out of ${recordName}`;
    case "event.officer_assigned":
      return `Assigned ${personName} to ${recordName}`;
    case "event.officer_removed":
      return `Removed ${personName} from ${recordName}`;
    case "event.officers_bulk_added": {
      const ids = Array.isArray(detail?.officer_ids) ? detail.officer_ids : [];
      const names = ids
        .map((id) => (typeof id === "number" ? id : Number(id)))
        .filter(Number.isSafeInteger)
        .map((id) => context.officerNames?.get(id))
        .filter((name): name is string => typeof name === "string");
      if (names.length > 0)
        return `Added ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} others` : ""} to ${recordName}`;
      return `${knownActions[entry.action]} (${ids.length} ${ids.length === 1 ? "officer" : "officers"})`;
    }
    case "task.assigned":
      return `Assigned ${personName} to ${recordName}`;
    case "task.officer_added":
      return `Added ${personName} to ${recordName}`;
    case "task.officer_removed":
      return `Removed ${personName} from ${recordName}`;
    case "task.completion_changed":
      return readString(asObject(detail?.after), ["status"]) === "Completed"
        ? `Marked ${personName}'s assignment complete for ${recordName}`
        : `Marked ${personName}'s assignment not completed for ${recordName}`;
    case "task.completed":
      return `${personName} completed ${recordName}`;
    case "task.approved":
      return `${recordName} was approved for ${personName}`;
    case "officer.role_changed":
      return `Changed ${readString(detail, ["officer_name"]) ?? personName}'s application role`;
    case "points.manual_created":
    case "points.correction_created":
    case "points.participation_created":
    case "points.participation_removed":
    case "points.task_created":
    case "points.task_reactivated":
    case "points.task_removed":
    case "points.transaction_removed":
    case "points.transaction_updated": {
      const points =
        detail?.points ??
        asObject(detail?.after)?.points ??
        asObject(detail?.before)?.points;
      const verb = pointActionVerbs[entry.action] ?? "Updated points";
      return `${verb}${points !== undefined ? ` (${formatValue(points)} points)` : ""} for ${personName}${recordName ? ` · ${recordName}` : ""}`;
    }
    case "warning.created":
    case "warning.approved_by_approver":
    case "warning.rejected_by_approver":
      return `${knownActions[entry.action]} for ${readString(detail, ["officer_name"]) ?? personName}`;
    default: {
      const summary = knownActions[entry.action];
      if (summary) return `${summary}${recordName ? ` · ${recordName}` : ""}`;
      return "Recorded an activity with an unrecognized action";
    }
  }
}

export function presentAuditEntry(
  entry: AuditEntryForPresentation,
  context: AuditPresentationContext = {},
): AuditPresentation {
  const details = asObject(entry.details);
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
        (knownActions[entry.action]
          ? knownActions[entry.action]
          : "Additional audit data recorded"));

  if (entry.action === "event.signup")
    detailSummary = `${officerName ?? "Officer"} signed up`;
  else if (entry.action === "event.signout")
    detailSummary = `${officerName ?? "Officer"} signed out`;
  else if (entry.action === "event.officer_assigned")
    detailSummary = `Assigned to ${officerName ?? "Officer"}`;
  else if (entry.action === "event.officer_removed")
    detailSummary = `Removed ${officerName ?? "Officer"}`;
  else if (entry.action === "task.assigned")
    detailSummary = `Assigned to ${officerName ?? "Officer"}`;
  else if (entry.action === "task.officer_added")
    detailSummary = `Added ${officerName ?? "Officer"}`;
  else if (entry.action === "task.officer_removed")
    detailSummary = `Removed ${officerName ?? "Officer"}`;
  else if (entry.action === "task.completion_changed")
    detailSummary = `${readString(asObject(details?.after), ["status"]) ?? "Updated"} for ${officerName ?? "Officer"}`;
  else if (entry.action === "task.completed")
    detailSummary = `Completed by ${officerName ?? "Officer"}`;
  else if (entry.action === "task.approved")
    detailSummary = `Approved for ${officerName ?? "Officer"}`;
  else if (
    entry.action === "event.officers_bulk_added" &&
    Array.isArray(details?.officer_ids)
  )
    detailSummary = `${details.officer_ids.length} ${details.officer_ids.length === 1 ? "officer" : "officers"} added`;

  return {
    activity: sentenceFor(entry, details, officerName, label, context),
    record: { label, href },
    changes,
    detailSummary,
  };
}
