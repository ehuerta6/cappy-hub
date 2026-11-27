import "server-only";
import {
  academicPeriodForDate,
  type AcademicPeriod,
  type AcademicPeriodData,
} from "@/lib/academic-periods";
import { canManageEvent, type AuthorizationContext } from "@/lib/authorization";
import type { Tables } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase/server";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { enrichOfficerNotifications } from "@/lib/notification-enrichment";
import { DASHBOARD_PREVIEW_LIMIT } from "./dashboard-limits";

// One extra row per source detects overflow without loading the full list.
const queryLimit = DASHBOARD_PREVIEW_LIMIT + 1;
const taskSelection =
  "id,title,due_date,due_time,task_officer_assignments!inner(officer_id,completed_at,completion_approval_pending)";

type ActionTask = Pick<
  Tables<"tasks">,
  "id" | "title" | "due_date" | "due_time"
> & {
  task_officer_assignments: (Pick<
    Tables<"task_officer_assignments">,
    "officer_id" | "completed_at"
  > & {
    completion_approval_pending?: boolean | null;
  })[];
};
export type ActionItem = {
  key: string;
  kind: "event" | "task" | "warning";
  title: string;
  detail?: string;
  href: string;
  status: string;
  taskId?: number;
  pendingApproval?: boolean;
  dueDate?: string;
  dueTime?: string | null;
  reminder?: string;
  sortAt: string;
};
export type DashboardActionItems = ReturnType<typeof dashboardActionItems> & {
  unavailableSources: {
    tasks: boolean;
    events: boolean;
    notifications: boolean;
  };
};

type ActionEvent = Pick<
  Tables<"events">,
  "id" | "name" | "event_date" | "starts_at"
>;
type ActionNotification = Pick<
  Tables<"notifications">,
  "id" | "title" | "kind" | "entity_type" | "entity_id" | "href" | "created_at"
> & {
  message?: string | null;
};

export function dashboardActionItems(
  actor: AuthorizationContext,
  personalTasks: ActionTask[],
  upcomingEvents: ActionEvent[] = [],
  attentionNotifications: ActionNotification[] = [],
) {
  const { today } = currentDenverWeek(new Date());
  const byDueDate = (a: ActionTask, b: ActionTask) =>
    a.due_date.localeCompare(b.due_date) || a.id - b.id;
  const taskItem = (task: ActionTask): ActionItem => {
    const own = task.task_officer_assignments.find(
      (assignment) => assignment.officer_id === actor.id,
    );
    const pendingApproval = Boolean(own?.completion_approval_pending);
    return {
      key: `task-${task.id}`,
      kind: "task",
      title: task.title,
      href: `/tasks/${task.id}`,
      status: pendingApproval
        ? "Awaiting approval"
        : task.due_date < today
          ? "Overdue"
          : "Not completed",
      taskId: task.id,
      pendingApproval,
      dueDate: task.due_date,
      dueTime: task.due_time,
      sortAt: `${task.due_date}T00:00:00Z`,
    };
  };
  const pendingTasks = personalTasks
    .filter((task) =>
      task.task_officer_assignments.some(
        (assignment) =>
          assignment.officer_id === actor.id &&
          assignment.completed_at === null,
      ),
    )
    .sort(byDueDate)
    .map(taskItem);
  const importantByEntity = new Map<string, ActionNotification[]>();
  const reminders = new Map<string, ActionNotification[]>();
  for (const notification of attentionNotifications) {
    if (
      notification.entity_type !== "event" &&
      notification.entity_type !== "task" &&
      notification.kind !== "warning.threshold"
    )
      continue;
    if (notification.entity_id === null) continue;
    const key = `${notification.entity_type}:${notification.entity_id}`;
    const destination = notification.kind.endsWith(".reminder")
      ? reminders
      : importantByEntity;
    destination.set(key, [...(destination.get(key) ?? []), notification]);
  }
  const merged = new Map(
    pendingTasks.map((item) => [`task:${item.key.slice(5)}`, item]),
  );
  for (const event of upcomingEvents) {
    const key = `event:${event.id}`;
    const notices = importantByEntity.get(key) ?? [];
    const eventReminders = reminders.get(key) ?? [];
    merged.set(key, {
      key,
      kind: "event",
      title: notices[0]?.title ?? event.name,
      href: `/events/${event.id}`,
      status: notices.length
        ? "Needs review"
        : eventReminders.length
          ? "Reminder due"
          : "Signed up",
      dueDate: event.event_date,
      reminder: eventReminders.length ? "Reminder due" : undefined,
      sortAt: event.starts_at,
    });
  }
  for (const task of merged.values()) {
    if (!task.key.startsWith("task-")) continue;
    const id = Number(task.key.slice(5));
    const notices = importantByEntity.get(`task:${id}`) ?? [];
    const taskReminders = reminders.get(`task:${id}`) ?? [];
    if (notices.length) task.status = "Needs review";
    else if (
      taskReminders.length &&
      task.status !== "Overdue" &&
      task.status !== "Awaiting approval"
    )
      task.status = "Reminder due";
    if (taskReminders.length) task.reminder = "Reminder due";
  }
  for (const [entityKey, notices] of importantByEntity) {
    if (
      (!entityKey.startsWith("event:") && !entityKey.startsWith("task:")) ||
      merged.has(entityKey)
    )
      continue;
    const notification = [...notices].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0];
    merged.set(`notification:${entityKey}`, {
      key: `notification-${entityKey}`,
      kind: entityKey.startsWith("event:") ? "event" : "task",
      title: notification.title,
      detail: notification.message || undefined,
      href: notification.href,
      status: "Needs review",
      sortAt: notification.created_at,
    });
  }
  for (const notification of attentionNotifications) {
    if (notification.kind !== "warning.threshold") continue;
    merged.set(`notification:${notification.id}`, {
      key: `notification-${notification.id}`,
      kind: "warning",
      title: notification.title,
      detail: notification.message || undefined,
      href: notification.href,
      status: "Needs review",
      sortAt: notification.created_at,
    });
  }
  const items = [...merged.values()].sort(
    (a, b) => a.sortAt.localeCompare(b.sortAt) || a.key.localeCompare(b.key),
  );
  return {
    items: items.slice(0, DASHBOARD_PREVIEW_LIMIT),
    hasMore: items.length > DASHBOARD_PREVIEW_LIMIT,
  };
}

export async function loadDashboardActionItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actor: AuthorizationContext,
  periodData: AcademicPeriodData,
  selectedPeriod: Pick<AcademicPeriod, "starts_on" | "ends_on"> | null = null,
): Promise<DashboardActionItems> {
  const taskQuery = () =>
    supabase
      .from("tasks")
      .select(taskSelection)
      .is("removed_at", null)
      .is("no_longer_needed_at", null)
      .order("due_date")
      .order("id")
      .limit(queryLimit);
  let signedUpEventsQuery = supabase
    .from("events")
    .select(
      "id,name,event_date,starts_at,event_officers!inner(officer_id,removed_at)",
    )
    .eq("event_officers.officer_id", actor.id)
    .is("event_officers.removed_at", null)
    .gt("starts_at", new Date().toISOString())
    .is("deleted_at", null)
    .neq("status", "cancelled");
  if (selectedPeriod) {
    signedUpEventsQuery = signedUpEventsQuery
      .gte("event_date", selectedPeriod.starts_on)
      .lte("event_date", selectedPeriod.ends_on);
  }
  const [assigned, eventResult, notificationsResult] = await Promise.all([
    taskQuery()
      .eq("task_officer_assignments.officer_id", actor.id)
      .is("task_officer_assignments.completed_at", null),
    signedUpEventsQuery.order("starts_at").order("id"),
    supabase
      .from("notifications")
      .select("id,title,message,kind,entity_type,entity_id,href,created_at")
      .eq("priority", "important")
      .is("reviewed_at", null)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  const tasksUnavailable = assigned.error !== null || assigned.data === null;
  const eventsUnavailable =
    eventResult.error !== null || eventResult.data === null;
  const notificationsUnavailable =
    notificationsResult.error !== null || notificationsResult.data === null;
  let visibleNotifications = notificationsUnavailable
    ? []
    : await enrichOfficerNotifications(supabase, notificationsResult.data);

  const signedUpEventIds = new Set(
    (eventsUnavailable ? [] : eventResult.data).map((event) => event.id),
  );
  const unverifiedEventIds = [
    ...new Set(
      visibleNotifications
        .filter(
          (notification) =>
            notification.entity_type === "event" &&
            notification.entity_id !== null &&
            !signedUpEventIds.has(notification.entity_id),
        )
        .map((notification) => notification.entity_id as number),
    ),
  ];
  let eventNotificationsUnavailable = false;
  if (unverifiedEventIds.length > 0) {
    const { data: referencedEvents, error: referencedEventsError } =
      await supabase
        .from("events")
        .select("id,event_date,deleted_at,event_branches(branch_id)")
        .in("id", unverifiedEventIds);
    if (referencedEventsError || !referencedEvents) {
      eventNotificationsUnavailable = true;
      visibleNotifications = visibleNotifications.filter(
        (notification) =>
          notification.entity_type !== "event" ||
          notification.entity_id === null ||
          signedUpEventIds.has(notification.entity_id),
      );
    } else {
      const accessibleEventLinks = new Map<number, string>();
      for (const event of referencedEvents) {
        const period = academicPeriodForDate(
          event.event_date,
          periodData.periods,
        );
        // The historical detail route does not expose deleted records.
        if (
          event.deleted_at &&
          ((period && period.ends_on < periodData.currentDate) ||
            !canManageEvent(
              actor,
              (event.event_branches ?? []).map((branch) => branch.branch_id),
            ))
        )
          continue;
        accessibleEventLinks.set(
          event.id,
          `/events/${event.id}?period=${period?.id ?? "none"}`,
        );
      }
      visibleNotifications = visibleNotifications.flatMap((notification) => {
        if (
          notification.entity_type !== "event" ||
          notification.entity_id === null ||
          signedUpEventIds.has(notification.entity_id)
        ) {
          return [notification];
        }
        const href = accessibleEventLinks.get(notification.entity_id);
        return href ? [{ ...notification, href }] : [];
      });
    }
  }

  return {
    ...dashboardActionItems(
      actor,
      tasksUnavailable ? [] : assigned.data,
      eventsUnavailable ? [] : eventResult.data,
      visibleNotifications,
    ),
    unavailableSources: {
      tasks: tasksUnavailable,
      events: eventsUnavailable,
      notifications: notificationsUnavailable || eventNotificationsUnavailable,
    },
  };
}
