import "server-only";
import type { AuthorizationContext } from "@/lib/authorization";
import type { Tables } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase/server";
import { DASHBOARD_PREVIEW_LIMIT } from "./dashboard-limits";

// One extra row per source detects overflow without loading the full list.
const queryLimit = DASHBOARD_PREVIEW_LIMIT + 1;
const taskSelection =
  "id,title,due_date,due_time,task_officer_assignments!inner(officer_id,completed_at)";

type ActionTask = Pick<
  Tables<"tasks">,
  "id" | "title" | "due_date" | "due_time"
> & {
  task_officer_assignments: Pick<
    Tables<"task_officer_assignments">,
    "officer_id" | "completed_at"
  >[];
};
export type ActionItem = {
  key: string;
  title: string;
  href: string;
  status: string;
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
>;

export function dashboardActionItems(
  actor: AuthorizationContext,
  personalTasks: ActionTask[],
  upcomingEvents: ActionEvent[] = [],
  attentionNotifications: ActionNotification[] = [],
) {
  const byDueDate = (a: ActionTask, b: ActionTask) =>
    a.due_date.localeCompare(b.due_date) || a.id - b.id;
  const taskItem = (task: ActionTask): ActionItem => ({
    key: `task-${task.id}`,
    title: task.title,
    href: `/tasks/${task.id}`,
    status: "Not completed",
    dueDate: task.due_date,
    dueTime: task.due_time,
    sortAt: `${task.due_date}T00:00:00Z`,
  });
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
    else if (taskReminders.length) task.status = "Reminder due";
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
      title: notification.title,
      href: notification.href,
      status: "Needs review",
      sortAt: notification.created_at,
    });
  }
  for (const notification of attentionNotifications) {
    if (
      notification.entity_type === "event" ||
      notification.entity_type === "task" ||
      notification.kind.endsWith(".reminder") ||
      notification.entity_id === null
    )
      continue;
    merged.set(`notification:${notification.id}`, {
      key: `notification-${notification.id}`,
      title: notification.title,
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
): Promise<DashboardActionItems> {
  const taskQuery = () =>
    supabase
      .from("tasks")
      .select(taskSelection)
      .is("removed_at", null)
      .order("due_date")
      .order("id")
      .limit(queryLimit);
  const assigned = await taskQuery()
    .eq("task_officer_assignments.officer_id", actor.id)
    .is("task_officer_assignments.completed_at", null);
  const tasksUnavailable = assigned.error !== null || assigned.data === null;
  const eventResult = await supabase
    .from("events")
    .select(
      "id,name,event_date,starts_at,event_officers!inner(officer_id,removed_at)",
    )
    .eq("event_officers.officer_id", actor.id)
    .is("event_officers.removed_at", null)
    .gt("starts_at", new Date().toISOString())
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("starts_at")
    .order("id");
  const eventsUnavailable =
    eventResult.error !== null || eventResult.data === null;
  const notificationsResult = await supabase
    .from("notifications")
    .select("id,title,kind,entity_type,entity_id,href,created_at")
    .eq("priority", "important")
    .is("reviewed_at", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  const notificationsUnavailable =
    notificationsResult.error !== null || notificationsResult.data === null;
  return {
    ...dashboardActionItems(
      actor,
      tasksUnavailable ? [] : assigned.data,
      eventsUnavailable ? [] : eventResult.data,
      notificationsUnavailable ? [] : notificationsResult.data,
    ),
    unavailableSources: {
      tasks: tasksUnavailable,
      events: eventsUnavailable,
      notifications: notificationsUnavailable,
    },
  };
}
