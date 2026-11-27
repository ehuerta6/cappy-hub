import ContextualBackLink from "@/components/contextual-back-link";
import {
  CopyCanonicalLinkButton,
  CopyTextButton,
} from "@/components/copy-button";
import PointTransactionTable from "@/components/point-transaction-table";
import {
  ActionLink,
  BranchBadges,
  PageHeader,
  PointValue,
  SectionHeading,
  StatusBadge,
  SuccessNotice,
  TableFrame,
} from "@/components/ui";
import {
  getAuthorizationContext,
  canManageOfficers,
  isAdmin,
} from "@/lib/authorization";
import { eventStatus } from "@/lib/event-status";
import {
  formatCalendarDate,
  formatDate,
  formatLabel,
} from "@/lib/presentation";
import { createClient } from "@/lib/supabase/server";
import {
  safeReturnTo,
  withReturnTo,
  listReturnUrl,
  type NavigationSearchParams,
} from "@/lib/return-context";
import Link from "next/link";
import { notFound } from "next/navigation";
import RoleForm from "./role-form";
import {
  CreateWarningForm,
  DeleteWarningForm,
  EditWarningForm,
  RestoreWarningForm,
} from "../warning-forms";
import TransactionForm from "../../points/transaction-form";
import type { Tables } from "@/lib/database.types";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";

type Warning = Tables<"officer_warnings">;
type EventAssociation = { events: Tables<"events"> };
type PointTransactionWithRelations = Tables<"point_transactions"> & {
  officers: Pick<Tables<"officers">, "id" | "name">;
  events: Pick<Tables<"events">, "id" | "name"> | null;
  tasks: Pick<Tables<"tasks">, "id" | "title"> | null;
};

export default async function OfficerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const [actor, supabase, { id: officerIdParam }, context, periodData] =
    await Promise.all([
      getAuthorizationContext(),
      createClient(),
      params,
      searchParams ?? Promise.resolve<NavigationSearchParams>({}),
      getAcademicPeriodData(),
    ]);
  const periodSelection = resolveAcademicPeriod(context.period, periodData);
  const selectedPeriod = periodSelection.period;
  const { returnTo } = context;
  const safeReturnDestination =
    safeReturnTo(returnTo) ?? listReturnUrl("/officers", context);
  const warningView =
    context.warningStatus === "deleted" || context.warningStatus === "all"
      ? context.warningStatus
      : "active";
  if (!/^-?[1-9]\d*$/.test(officerIdParam)) notFound();
  const officerId = Number(officerIdParam);
  const { data: officer, error } = await supabase
    .from("officers")
    .select("*, positions(name), officer_branches(branches(name,color))")
    .eq("id", officerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load officer: ${error.message}`);
  if (!officer) notFound();

  const showWarnings = isAdmin(actor) || actor.id === officer.id;

  const makeWarningsQuery = () => {
    let query = supabase
      .from("officer_warnings")
      .select("*")
      .eq("officer_id", officer.id);
    if (!isAdmin(actor)) {
      query = query
        .eq("status", "approved")
        .is("voided_at", null)
        .is("deleted_at", null);
    } else if (warningView === "deleted") {
      query = query.not("deleted_at", "is", null);
    } else if (warningView !== "all") {
      query = query
        .eq("status", "approved")
        .is("voided_at", null)
        .is("deleted_at", null);
    }
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  };

  const makeEventsQuery = () => {
    let query = supabase
      .from("event_officers")
      .select("events!inner(*)")
      .eq("officer_id", officer.id)
      .is("removed_at", null)
      .is("events.deleted_at", null)
      .neq("events.status", "cancelled")
      .order("events(event_date)", { ascending: false })
      .order("events(id)", { ascending: false });
    if (selectedPeriod)
      query = query
        .gte("events.event_date", selectedPeriod.starts_on)
        .lte("events.event_date", selectedPeriod.ends_on);
    return query;
  };

  const makeTasksQuery = () => {
    let query = supabase
      .from("task_officer_assignments")
      .select(
        "completed_at,approved_at,tasks!inner(id,title,due_date,points,task_type,removed_at)",
      )
      .eq("officer_id", officer.id)
      .is("removed_at", null)
      .is("tasks.removed_at", null)
      .order("tasks(due_date)", { ascending: false })
      .order("tasks(id)", { ascending: false });
    if (selectedPeriod)
      query = query
        .gte("tasks.due_date", selectedPeriod.starts_on)
        .lte("tasks.due_date", selectedPeriod.ends_on);
    return query;
  };

  const periodTransactionIds = selectedPeriod
    ? await supabase
        .from("point_history")
        .select("id")
        .eq("officer_id", officer.id)
        .is("removed_at", null)
        .gte("activity_date", selectedPeriod.starts_on)
        .lte("activity_date", selectedPeriod.ends_on)
    : null;
  if (periodTransactionIds?.error)
    throw new Error("Failed to load Officer period Points");
  const transactionIds = periodTransactionIds?.data
    .map((row) => row.id)
    .filter((id): id is number => id !== null);

  const makeTransactionsQuery = () => {
    let query = supabase
      .from("point_transactions")
      .select(
        "*,officers!point_transactions_officer_id_fkey(id,name),events(id,name),tasks(id,title)",
      )
      .is("removed_at", null)
      .eq("officer_id", officer.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (transactionIds)
      query = transactionIds.length
        ? query.in("id", transactionIds)
        : query.eq("id", -1);
    return query;
  };

  const canAddPointAdjustment =
    isAdmin(actor) &&
    !periodSelection.isHistorical &&
    (selectedPeriod === null ||
      selectedPeriod.id === periodData.currentPeriodId);

  const [
    total,
    periodSummaryResult,
    warningsResult,
    approvedCountResult,
    eventsResult,
    tasksResult,
    transactionsResult,
    adjustmentEventsResult,
    adjustmentTasksResult,
  ] = await Promise.all([
    supabase
      .from("officer_point_totals")
      .select("total_points")
      .eq("id", officerId)
      .single(),
    selectedPeriod
      ? supabase
          .rpc("academic_period_point_summary", {
            p_period_id: selectedPeriod.id,
          })
          .single()
      : Promise.resolve({ data: null, error: null }),
    showWarnings
      ? makeWarningsQuery()
      : Promise.resolve({ data: [], error: null }),
    showWarnings
      ? supabase
          .from("officer_warnings")
          .select("id", { count: "exact", head: true })
          .eq("officer_id", officer.id)
          .eq("status", "approved")
          .is("voided_at", null)
          .is("deleted_at", null)
      : Promise.resolve({ count: 0, error: null }),
    makeEventsQuery(),
    makeTasksQuery(),
    makeTransactionsQuery(),
    canAddPointAdjustment
      ? supabase
          .from("events")
          .select("id,name,event_date")
          .is("deleted_at", null)
          .order("event_date", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    canAddPointAdjustment
      ? supabase
          .from("tasks")
          .select("id,title,due_date")
          .is("removed_at", null)
          .order("due_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const periodRanking = (periodSummaryResult.data?.ranking ?? []) as Array<{
    officer_id: number;
    points: number;
  }>;
  const periodRankIndex = periodRanking.findIndex(
    (row) => row.officer_id === officer.id,
  );
  const periodPoints =
    periodRankIndex >= 0 ? periodRanking[periodRankIndex].points : 0;
  const periodRank = periodRankIndex >= 0 ? periodRankIndex + 1 : null;

  const warnings = warningsResult as {
    data: Warning[] | null;
    error: { message: string } | null;
  };
  const events = eventsResult as {
    data: EventAssociation[] | null;
    error: { message: string } | null;
  };
  const tasks = tasksResult as {
    data:
      | {
          completed_at: string | null;
          approved_at: string | null;
          tasks: Pick<
            Tables<"tasks">,
            "id" | "title" | "due_date" | "points" | "task_type" | "removed_at"
          >;
        }[]
      | null;
    error: { message: string } | null;
  };
  const transactions = transactionsResult as {
    data: PointTransactionWithRelations[] | null;
    error: { message: string } | null;
  };
  const approvedCount = approvedCountResult.count ?? 0;
  const visibleWarnings = warnings.data ?? [];
  const associatedEvents = (events.data ?? []).filter(
    ({ events: event }) => !event.deleted_at && event.status !== "cancelled",
  );
  const associatedTasks = tasks.data ?? [];
  const officerTransactions = transactions.data ?? [];

  const warningStatusHref = (status: string) => {
    const query = new URLSearchParams();
    if (context.period !== undefined)
      query.set("period", String(context.period));
    if (status !== "active") query.set("warningStatus", status);
    const search = query.toString();
    return withReturnTo(
      `/officers/${officerIdParam}${search ? `?${search}` : ""}`,
      safeReturnDestination,
    );
  };

  const completedTasksCount = associatedTasks.filter((t) =>
    Boolean(t.completed_at),
  ).length;

  return (
    <div data-record-page="officer" className="space-y-5">
      <ContextualBackLink href="/officers" returnTo={safeReturnDestination}>
        Back to officers
      </ContextualBackLink>
      <PageHeader
        title={officer.name}
        description={
          <>
            {officer.positions.name} <span aria-hidden="true">·</span>{" "}
            {formatLabel(officer.application_role)}
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <CopyCanonicalLinkButton path={`/officers/${officerIdParam}`} />
            {canManageOfficers(actor) && !periodSelection.isHistorical && (
              <ActionLink
                href={withReturnTo(
                  `/officers/${officerIdParam}/edit`,
                  safeReturnDestination,
                )}
              >
                Edit officer
              </ActionLink>
            )}
          </div>
        }
      />
      <SuccessNotice status={context.feedback} />

      {showWarnings &&
        isAdmin(actor) &&
        !approvedCountResult.error &&
        approvedCount >= 3 && (
          <div
            role="status"
            className="rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm font-medium text-foreground"
          >
            Admin Review — three or more approved warnings. Deactivation is a
            separate manual decision.
          </div>
        )}

      <div
        className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${showWarnings ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
      >
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {selectedPeriod
              ? `Points (${selectedPeriod.name})`
              : "Total points"}
          </p>
          {selectedPeriod && !periodSummaryResult.error ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <p className="text-lg font-semibold leading-tight text-foreground">
                <PointValue value={periodPoints} />
              </p>
              {periodRank !== null && (
                <span className="text-xs font-medium tabular-nums text-muted">
                  #{periodRank}
                </span>
              )}
              {!total.error && (
                <span className="text-xs text-muted">
                  · All-time:{" "}
                  <PointValue value={total.data.total_points ?? 0} />
                </span>
              )}
            </div>
          ) : total.error ? (
            <p role="alert" className="mt-1 text-xs">
              Total points unavailable.
            </p>
          ) : (
            <p className="mt-1 text-lg font-semibold leading-tight text-foreground">
              <PointValue value={total.data.total_points ?? 0} />
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Events
          </p>
          <p className="mt-1 text-lg font-semibold leading-tight tabular-nums text-foreground">
            {associatedEvents.length}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Tasks done
          </p>
          <p className="mt-1 text-lg font-semibold leading-tight tabular-nums text-foreground">
            {completedTasksCount}
            <span className="text-xs font-normal text-muted">
              /{associatedTasks.length}
            </span>
          </p>
        </div>

        {showWarnings && (
          <div
            className={`rounded-lg border px-4 py-3 ${
              approvedCount >= 3
                ? "border-warning-border bg-warning-bg/30"
                : "border-border bg-surface"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Approved warnings
            </p>
            <p className="mt-1 text-lg font-semibold leading-tight tabular-nums text-foreground">
              {approvedCount}
            </p>
          </div>
        )}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(20rem,1fr)]">
        <div className="min-w-0 space-y-5">
          <section
            aria-label="Point history"
            className="space-y-3 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
          >
            <SectionHeading
              title={`Point history (${officerTransactions.length})`}
              action={
                <div className="flex flex-wrap items-center gap-3">
                  {canAddPointAdjustment && (
                    <TransactionForm
                      officers={[{ id: officer.id, name: officer.name }]}
                      events={adjustmentEventsResult.data ?? []}
                      tasks={adjustmentTasksResult.data ?? []}
                      defaultOfficerId={officer.id}
                      compact
                    />
                  )}
                  <Link
                    href={`/points?${new URLSearchParams({ view: "history", officer: String(officer.id), ...(context.period === undefined ? {} : { period: String(context.period) }) })}`}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    View in Points history
                  </Link>
                </div>
              }
            />
            {transactions.error ? (
              <p role="alert" className="text-sm">
                Point history unavailable. Reload this page to retry.
              </p>
            ) : (
              <TableFrame compact label="Officer point history">
                <PointTransactionTable
                  transactions={officerTransactions}
                  hideOfficer
                  period={
                    typeof context.period === "string"
                      ? context.period
                      : undefined
                  }
                />
              </TableFrame>
            )}
          </section>

          <section
            aria-label="Associated tasks"
            className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
          >
            <SectionHeading
              title={`Associated tasks (${associatedTasks.length})`}
            />
            {tasks.error ? (
              <p role="alert" className="text-sm">
                Tasks unavailable. Reload this page to retry.
              </p>
            ) : associatedTasks.length === 0 ? (
              <p className="text-sm text-muted">No associated Tasks yet.</p>
            ) : (
              <TableFrame compact label="Officer tasks">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Task</th>
                      <th scope="col">Due</th>
                      <th scope="col">Points</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {associatedTasks.map((assignment) => {
                      if (!assignment.tasks) return null;
                      return (
                        <tr key={assignment.tasks.id}>
                          <td>
                            <Link
                              href={withReturnTo(
                                `/tasks/${assignment.tasks.id}`,
                                listReturnUrl("/tasks", {
                                  period: context.period,
                                }),
                              )}
                            >
                              {assignment.tasks.title}
                            </Link>
                          </td>
                          <td>
                            {formatCalendarDate(assignment.tasks.due_date)}
                          </td>
                          <td>
                            <PointValue value={assignment.tasks.points} />
                          </td>
                          <td>
                            {assignment.completed_at
                              ? "Complete"
                              : "Incomplete"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableFrame>
            )}
          </section>

          <section
            aria-label="Associated events"
            className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
          >
            <SectionHeading
              title={`Associated events (${associatedEvents.length})`}
            />
            {events.error ? (
              <p role="alert" className="text-sm">
                Associated events unavailable. Reload this page to retry.
              </p>
            ) : !associatedEvents.length ? (
              <p className="text-sm text-muted">No associated events yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface-muted/30 px-3 text-sm">
                {associatedEvents.map(({ events: event }: EventAssociation) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <Link
                      href={withReturnTo(
                        `/events/${event.id}`,
                        listReturnUrl("/events", { period: context.period }),
                      )}
                      className="break-words font-medium text-foreground hover:text-brand hover:underline"
                    >
                      {event.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">
                        {formatCalendarDate(event.event_date)}
                      </span>
                      <StatusBadge status={eventStatus(event)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-5 lg:sticky lg:top-6">
          <section
            aria-label="Profile details"
            className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
          >
            <SectionHeading title="Profile & contact" />
            <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] text-sm [&>dd]:min-w-0 [&>dd]:break-words">
              <dt>Status</dt>
              <dd>
                <StatusBadge status={officer.status} />
              </dd>
              <dt>Position</dt>
              <dd>{officer.positions.name}</dd>
              <dt>Branches</dt>
              <dd>
                <BranchBadges
                  branches={officer.officer_branches.map(
                    (membership) => membership.branches,
                  )}
                />
              </dd>
              <dt>Classification</dt>
              <dd>
                {officer.classification
                  ? formatLabel(officer.classification)
                  : "Not specified"}
              </dd>
              <dt>Application role</dt>
              <dd>{formatLabel(officer.application_role)}</dd>
              <dt>UTEP email</dt>
              <dd>
                {officer.utep_email ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <a
                      href={`mailto:${officer.utep_email}`}
                      className="text-foreground hover:text-brand hover:underline underline-offset-3"
                    >
                      {officer.utep_email}
                    </a>
                    <CopyTextButton
                      value={officer.utep_email}
                      label={`Copy ${officer.name}'s UTEP email`}
                      toastMessage="Email copied"
                    />
                  </span>
                ) : (
                  "Not provided"
                )}
              </dd>
              <dt>Personal email</dt>
              <dd>
                {officer.personal_email ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <a
                      href={`mailto:${officer.personal_email}`}
                      className="text-foreground hover:text-brand hover:underline underline-offset-3"
                    >
                      {officer.personal_email}
                    </a>
                    <CopyTextButton
                      value={officer.personal_email}
                      label={`Copy ${officer.name}'s personal email`}
                      toastMessage="Email copied"
                    />
                  </span>
                ) : (
                  "Not provided"
                )}
              </dd>
            </dl>

            {!periodSelection.isHistorical &&
              canManageOfficers(actor) &&
              actor.id !== officer.id && (
                <div className="space-y-2 border-t border-border pt-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Application access
                  </h3>
                  <p className="text-xs text-muted">
                    Admin access is assigned separately from club position.
                  </p>
                  <RoleForm
                    officerId={officer.id}
                    role={officer.application_role}
                  />
                </div>
              )}
          </section>

          {showWarnings && (
            <section
              aria-label="Warnings"
              className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
            >
              <SectionHeading
                title={`Warnings (${visibleWarnings.length})`}
                action={
                  isAdmin(actor) &&
                  !periodSelection.isHistorical &&
                  !warnings.error ? (
                    <CreateWarningForm
                      officerId={officer.id}
                      approvedWarningCount={approvedCount}
                    />
                  ) : undefined
                }
              />
              {isAdmin(actor) && (
                <nav
                  aria-label="Warning status"
                  className="flex flex-wrap gap-1 border-b border-border text-xs"
                >
                  {[
                    ["Active", "active"],
                    ["Deleted", "deleted"],
                    ["All history", "all"],
                  ].map(([label, status]) => {
                    const active = warningView === status;
                    return (
                      <Link
                        key={status}
                        href={warningStatusHref(status)}
                        aria-current={active ? "page" : undefined}
                        className={`border-b-2 px-2.5 py-1.5 ${active ? "border-brand font-semibold text-brand" : "border-transparent text-muted hover:text-foreground"}`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </nav>
              )}
              {warnings.error && (
                <p role="alert" className="text-sm">
                  Warning history unavailable. Reload this page to retry.
                </p>
              )}
              {isAdmin(actor) && approvedCountResult.error && (
                <p role="alert" className="text-sm">
                  Approved warning count unavailable. Reload this page to retry.
                </p>
              )}
              {!warnings.error && visibleWarnings.length === 0 && (
                <p className="text-sm text-muted">
                  {isAdmin(actor)
                    ? warningView === "deleted"
                      ? "No deleted warnings."
                      : warningView === "all"
                        ? "No warnings in history."
                        : "No active warnings."
                    : "No approved warnings."}
                </p>
              )}
              {!warnings.error &&
                visibleWarnings.map((warning) => (
                  <article
                    key={warning.id}
                    className="space-y-1.5 border-b border-border py-2.5 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <StatusBadge status={warning.status} />
                      <span className="text-muted">
                        {warning.origin === "automatic"
                          ? "Automatic"
                          : "Manual"}
                      </span>
                      {warning.deleted_at !== null && (
                        <span className="font-medium text-muted">Deleted</span>
                      )}
                      {warning.voided_at !== null && (
                        <span className="font-medium text-muted">Voided</span>
                      )}
                      <time
                        dateTime={warning.created_at}
                        className="text-muted"
                      >
                        {formatDate(warning.created_at)}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                      {warning.reason}
                    </p>
                    {isAdmin(actor) && !periodSelection.isHistorical && (
                      <div className="flex flex-wrap items-start gap-2 pt-1">
                        <EditWarningForm
                          warningId={warning.id}
                          officerId={officer.id}
                          reason={warning.reason}
                        />
                        {warning.deleted_at === null ? (
                          <DeleteWarningForm
                            warningId={warning.id}
                            officerId={officer.id}
                            origin={
                              warning.origin === "automatic"
                                ? "automatic"
                                : "manual"
                            }
                          />
                        ) : (
                          <RestoreWarningForm
                            warningId={warning.id}
                            officerId={officer.id}
                            origin={
                              warning.origin === "automatic"
                                ? "automatic"
                                : "manual"
                            }
                          />
                        )}
                      </div>
                    )}
                  </article>
                ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
