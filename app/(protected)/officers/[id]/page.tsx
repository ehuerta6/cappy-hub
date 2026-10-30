import ContextualBackLink from "@/components/contextual-back-link";
import PointTransactionTable from "@/components/point-transaction-table";
import { ListPagination } from "@/components/list-pagination";
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
  type NavigationSearchParams,
} from "@/lib/return-context";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import RoleForm from "./role-form";
import {
  CreateWarningForm,
  DeleteWarningForm,
  EditWarningForm,
  RestoreWarningForm,
} from "../warning-forms";
import type { Tables } from "@/lib/database.types";

const SECTION_PAGE_SIZE = 5;
const SECTION_PREVIEW_LIMITS = { warnings: 2, events: 4, points: 3 } as const;
type OfficerSection = "overview" | "warnings" | "events" | "points";
type Warning = Tables<"officer_warnings">;
type EventAssociation = { events: Tables<"events"> };
type PointTransactionWithRelations = Tables<"point_transactions"> & {
  officers: Pick<Tables<"officers">, "id" | "name">;
  events: Pick<Tables<"events">, "id" | "name"> | null;
  tasks: Pick<Tables<"tasks">, "id" | "title"> | null;
};

function parsePage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

function isValidPageParam(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return false;
  const page = Number(value);
  return Number.isSafeInteger(page) && String(page) === value;
}

function sectionHref(
  officerId: string,
  section: OfficerSection,
  params: URLSearchParams,
  page = 1,
): Route {
  const search = new URLSearchParams(params);
  search.set("section", section);
  if (page > 1) search.set("page", String(page));
  else search.delete("page");
  const query = search.toString();
  return (
    query ? `/officers/${officerId}?${query}` : `/officers/${officerId}`
  ) as Route;
}

function SectionLink({
  officerId,
  section,
  label,
  params,
  current,
}: {
  officerId: string;
  section: OfficerSection;
  label: string;
  params: URLSearchParams;
  current: boolean;
}) {
  return (
    <Link
      href={sectionHref(officerId, section, params)}
      aria-current={current ? "page" : undefined}
      className={`inline-flex min-h-9 items-center border-b-2 px-3 text-sm ${current ? "border-foreground font-semibold text-foreground" : "border-transparent text-secondary hover:text-foreground"}`}
    >
      {label}
    </Link>
  );
}

function SectionPager({
  officerId,
  section,
  params,
  page,
  totalPages,
}: {
  officerId: string;
  section: OfficerSection;
  params: URLSearchParams;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const filters = new URLSearchParams(params);
  filters.set("section", section);
  return (
    <ListPagination
      pathname={`/officers/${officerId}` as Route}
      label={`${section} list`}
      filters={filters}
      page={page}
      totalPages={totalPages}
      getPageHref={(target) => sectionHref(officerId, section, params, target)}
    />
  );
}

export default async function OfficerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const supabase = await createClient();
  const { id: officerIdParam } = await params;
  const context = (await searchParams) ?? {};
  const { returnTo } = context;
  const safeReturnDestination = safeReturnTo(returnTo);
  const warningView =
    context.warningStatus === "deleted" || context.warningStatus === "all"
      ? context.warningStatus
      : "active";
  if (!/^-?[1-9]\d*$/.test(officerIdParam)) notFound();
  const officerId = Number(officerIdParam);
  const { data: officer, error } = await supabase
    .from("officers")
    .select("*, positions(name), officer_branches(branches(name))")
    .eq("id", officerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load officer: ${error.message}`);
  if (!officer) notFound();

  const showWarnings = isAdmin(actor) || actor.id === officer.id;
  const requestedSection =
    typeof context.section === "string"
      ? context.section
      : context.warningStatus
        ? "warnings"
        : "overview";
  const section: OfficerSection = [
    "overview",
    "warnings",
    "events",
    "points",
  ].includes(requestedSection)
    ? (requestedSection as OfficerSection)
    : "overview";
  const visibleSection: OfficerSection =
    section === "warnings" && !showWarnings ? "overview" : section;
  if (section === "warnings" && !showWarnings)
    redirect(
      sectionHref(
        officerIdParam,
        "overview",
        new URLSearchParams(
          safeReturnDestination ? [["returnTo", safeReturnDestination]] : [],
        ),
      ),
    );
  const urlParams = new URLSearchParams();
  if (safeReturnDestination) urlParams.set("returnTo", safeReturnDestination);
  if (warningView !== "active") urlParams.set("warningStatus", warningView);
  const requestedPage = parsePage(context.page);
  if (context.page !== undefined && !isValidPageParam(context.page))
    redirect(sectionHref(officerIdParam, visibleSection, urlParams));
  if (visibleSection === "overview" && requestedPage > 1)
    redirect(
      sectionHref(
        officerIdParam,
        "overview",
        new URLSearchParams(
          safeReturnDestination ? [["returnTo", safeReturnDestination]] : [],
        ),
      ),
    );

  const makeWarningsQuery = (countOnly = false) =>
    (() => {
      let query = supabase
        .from("officer_warnings")
        .select(
          countOnly ? "id" : "*",
          countOnly ? { count: "exact", head: true } : undefined,
        )
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
      return query;
    })();
  const makeEventsQuery = (countOnly = false) => {
    let query = supabase
      .from("event_officers")
      .select(
        "events!inner(*)",
        countOnly ? { count: "exact", head: true } : { count: "exact" },
      )
      .eq("officer_id", officer.id)
      .is("removed_at", null)
      .is("events.deleted_at", null)
      .neq("events.status", "cancelled");
    if (!countOnly)
      query = query
        .order("events(event_date)", { ascending: false })
        .order("events(id)", { ascending: false });
    return query;
  };
  const makeTransactionsQuery = (countOnly = false) => {
    let query = supabase
      .from("point_transactions")
      .select(
        countOnly
          ? "id"
          : "*,officers!point_transactions_officer_id_fkey(id,name),events(id,name),tasks(id,title)",
        countOnly ? { count: "exact", head: true } : { count: "exact" },
      )
      .is("removed_at", null)
      .eq("officer_id", officer.id);
    if (!countOnly)
      query = query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
    return query;
  };

  const overview = visibleSection === "overview";
  const warningsNeeded =
    showWarnings && (overview || visibleSection === "warnings");
  const eventsNeeded = overview || visibleSection === "events";
  const pointsNeeded = overview || visibleSection === "points";
  const [
    total,
    warningCountResult,
    warningsResult,
    approvedCountResult,
    eventCountResult,
    eventsResult,
    transactionCountResult,
    transactionsResult,
  ] = await Promise.all([
    supabase
      .from("officer_point_totals")
      .select("total_points")
      .eq("id", officerId)
      .single(),
    warningsNeeded
      ? makeWarningsQuery(true)
      : Promise.resolve({ count: 0, error: null }),
    warningsNeeded
      ? (() => {
          const limit = overview
            ? SECTION_PREVIEW_LIMITS.warnings
            : SECTION_PAGE_SIZE;
          const from = overview ? 0 : (requestedPage - 1) * SECTION_PAGE_SIZE;
          return makeWarningsQuery()
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, from + limit - 1);
        })()
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
    eventsNeeded
      ? makeEventsQuery(true)
      : Promise.resolve({ count: 0, error: null }),
    eventsNeeded
      ? (() => {
          const limit = overview
            ? SECTION_PREVIEW_LIMITS.events
            : SECTION_PAGE_SIZE;
          const from = overview ? 0 : (requestedPage - 1) * SECTION_PAGE_SIZE;
          return makeEventsQuery().range(from, from + limit - 1);
        })()
      : Promise.resolve({ data: [], error: null }),
    pointsNeeded
      ? makeTransactionsQuery(true)
      : Promise.resolve({ count: 0, error: null }),
    pointsNeeded
      ? (() => {
          const limit = overview
            ? SECTION_PREVIEW_LIMITS.points
            : SECTION_PAGE_SIZE;
          const from = overview ? 0 : (requestedPage - 1) * SECTION_PAGE_SIZE;
          return makeTransactionsQuery().range(from, from + limit - 1);
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);
  const warnings = warningsResult as {
    data: Warning[] | null;
    error: { message: string } | null;
  };
  const events = eventsResult as {
    data: EventAssociation[] | null;
    error: { message: string } | null;
  };
  const transactions = transactionsResult as {
    data: PointTransactionWithRelations[] | null;
    error: { message: string } | null;
  };
  const warningCount = warningCountResult.count ?? 0;
  const eventCount = eventCountResult.count ?? 0;
  const transactionCount = transactionCountResult.count ?? 0;
  const warningPages = Math.max(1, Math.ceil(warningCount / SECTION_PAGE_SIZE));
  const eventPages = Math.max(1, Math.ceil(eventCount / SECTION_PAGE_SIZE));
  const transactionPages = Math.max(
    1,
    Math.ceil(transactionCount / SECTION_PAGE_SIZE),
  );
  const selectedPages =
    visibleSection === "warnings"
      ? warningPages
      : visibleSection === "events"
        ? eventPages
        : transactionPages;
  if (!overview && requestedPage > selectedPages)
    redirect(
      sectionHref(officerIdParam, visibleSection, urlParams, selectedPages),
    );
  const approvedCount = approvedCountResult.count ?? 0;
  const visibleWarnings = warnings.data ?? [];
  const associatedEvents = (events.data ?? []).filter(
    ({ events: event }) => !event.deleted_at && event.status !== "cancelled",
  );

  const sectionNav = (
    <nav
      aria-label="Officer profile sections"
      className="flex flex-wrap border-b border-border"
    >
      <SectionLink
        officerId={officerIdParam}
        section="overview"
        label="Overview"
        params={urlParams}
        current={visibleSection === "overview"}
      />
      {showWarnings && (
        <SectionLink
          officerId={officerIdParam}
          section="warnings"
          label={
            !warningsNeeded || warningCountResult.error
              ? "Warnings"
              : `Warnings (${warningCount})`
          }
          params={urlParams}
          current={visibleSection === "warnings"}
        />
      )}
      <SectionLink
        officerId={officerIdParam}
        section="events"
        label={
          !eventsNeeded || eventCountResult.error
            ? "Events"
            : `Events (${eventCount})`
        }
        params={urlParams}
        current={visibleSection === "events"}
      />
      <SectionLink
        officerId={officerIdParam}
        section="points"
        label={
          !pointsNeeded || transactionCountResult.error
            ? "Points"
            : `Points (${transactionCount})`
        }
        params={urlParams}
        current={visibleSection === "points"}
      />
    </nav>
  );

  const profile = (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
      <div className="min-w-0 space-y-3">
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm [&>dt]:mt-0 [&>dd]:mt-0 [&>dd]:min-w-0 [&>dd]:break-words">
          <dt>UTEP email</dt>
          <dd>{officer.utep_email ?? "Not provided"}</dd>
          <dt>Personal email</dt>
          <dd>{officer.personal_email ?? "Not provided"}</dd>
          <dt>Position</dt>
          <dd>{officer.positions.name}</dd>
          <dt>Application role</dt>
          <dd>{formatLabel(officer.application_role)}</dd>
          <dt>Classification</dt>
          <dd>
            {officer.classification
              ? formatLabel(officer.classification)
              : "Not specified"}
          </dd>
        </dl>
        {total.error ? (
          <p role="alert" className="text-sm">
            Total points unavailable. Reload this page to retry.
          </p>
        ) : (
          <p className="text-lg font-semibold">
            Total points: <PointValue value={total.data.total_points ?? 0} />
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-3">
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm [&>dt]:mt-0 [&>dd]:mt-0 [&>dd]:min-w-0 [&>dd]:break-words">
          <dt>Status</dt>
          <dd>
            <StatusBadge status={officer.status} />
          </dd>
          <dt>Branches</dt>
          <dd>
            <BranchBadges
              branches={officer.officer_branches.map(
                (membership) => membership.branches.name,
              )}
            />
          </dd>
        </dl>
        {canManageOfficers(actor) && actor.id !== officer.id && (
          <section className="space-y-2">
            <SectionHeading
              title="Application access"
              description="Admin access is assigned separately from club position."
            />
            <RoleForm officerId={officer.id} role={officer.application_role} />
          </section>
        )}
        {showWarnings && (
          <p className="text-sm">Approved warnings: {approvedCount}</p>
        )}
      </div>
    </div>
  );

  const warningStatusLinks = isAdmin(actor) ? (
    <nav
      aria-label="Warning status"
      className="flex flex-wrap gap-1 border-b border-border text-sm"
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
            href={withReturnTo(
              status === "active"
                ? `/officers/${officerIdParam}?section=warnings`
                : `/officers/${officerIdParam}?warningStatus=${status}`,
              returnTo,
            )}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 px-3 py-2 ${active ? "border-foreground font-semibold" : "border-transparent text-secondary hover:text-foreground"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  ) : null;

  const warningContent = showWarnings ? (
    <section aria-label="Warnings" className="min-w-0 space-y-3">
      <SectionHeading
        title="Warnings"
        action={
          isAdmin(actor) && !warnings.error ? (
            <CreateWarningForm officerId={officer.id} />
          ) : undefined
        }
      />
      {warningCountResult.error && (
        <p role="alert" className="text-sm">
          Warning count unavailable. Only the visible page may be shown.
        </p>
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
      {isAdmin(actor) && !approvedCountResult.error && approvedCount >= 3 && (
        <p role="status" className="font-semibold">
          Admin Review — three or more approved warnings. Deactivation is a
          separate manual decision.
        </p>
      )}
      {warningStatusLinks}
      {!warnings.error && visibleWarnings.length === 0 && (
        <p>
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
            className="space-y-2 border-b border-border py-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={warning.status} />
              {warning.deleted_at !== null && (
                <span className="text-sm font-medium text-muted">Deleted</span>
              )}
              {warning.voided_at !== null && (
                <span className="text-sm font-medium text-muted">Voided</span>
              )}
              <time dateTime={warning.created_at}>
                {formatDate(warning.created_at)}
              </time>
            </div>
            <p className="whitespace-pre-wrap break-words">{warning.reason}</p>
            {isAdmin(actor) && (
              <>
                <EditWarningForm
                  warningId={warning.id}
                  officerId={officer.id}
                  reason={warning.reason}
                />
                {warning.deleted_at === null ? (
                  <DeleteWarningForm
                    warningId={warning.id}
                    officerId={officer.id}
                  />
                ) : (
                  <RestoreWarningForm
                    warningId={warning.id}
                    officerId={officer.id}
                  />
                )}
              </>
            )}
          </article>
        ))}
      {!warnings.error && (
        <SectionPager
          officerId={officerIdParam}
          section="warnings"
          params={urlParams}
          page={requestedPage}
          totalPages={warningPages}
        />
      )}
    </section>
  ) : null;

  const eventContent = (
    <section aria-label="Associated events" className="min-w-0 space-y-3">
      <SectionHeading title="Associated events" />
      {eventCountResult.error && (
        <p role="alert" className="text-sm">
          Associated event count unavailable. Only the visible page may be
          shown.
        </p>
      )}
      {events.error ? (
        <p role="alert" className="text-sm">
          Associated events unavailable. Reload this page to retry.
        </p>
      ) : !associatedEvents.length ? (
        <p>No associated events yet.</p>
      ) : (
        <ul>
          {associatedEvents.map(({ events: event }: EventAssociation) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm"
            >
              <Link
                href={`/events/${event.id}`}
                className="break-words font-medium text-secondary hover:underline"
              >
                {event.name}
              </Link>
              <span className="text-subtle">
                {formatCalendarDate(event.event_date)}
              </span>
              <StatusBadge status={eventStatus(event)} />
            </li>
          ))}
        </ul>
      )}
      {!events.error && (
        <SectionPager
          officerId={officerIdParam}
          section="events"
          params={urlParams}
          page={requestedPage}
          totalPages={eventPages}
        />
      )}
    </section>
  );

  const pointContent = (
    <section aria-label="Point history" className="space-y-3">
      <SectionHeading title="Point history" />
      {transactionCountResult.error && (
        <p role="alert" className="text-sm">
          Point history count unavailable. Only the visible page may be shown.
        </p>
      )}
      {transactions.error ? (
        <p role="alert" className="text-sm">
          Point history unavailable. Reload this page to retry.
        </p>
      ) : (
        <TableFrame compact label="Officer point history">
          <PointTransactionTable transactions={transactions.data ?? []} />
        </TableFrame>
      )}
      {!transactions.error && (
        <SectionPager
          officerId={officerIdParam}
          section="points"
          params={urlParams}
          page={requestedPage}
          totalPages={transactionPages}
        />
      )}
      <Link
        href={`/points?officer=${officer.id}`}
        className="inline-block text-sm underline"
      >
        View all point history
      </Link>
    </section>
  );

  return (
    <div className="space-y-4">
      <ContextualBackLink href="/officers" returnTo={returnTo}>
        Back to officers
      </ContextualBackLink>
      <PageHeader
        title={officer.name}
        action={
          canManageOfficers(actor) ? (
            <ActionLink
              href={withReturnTo(`/officers/${officerIdParam}/edit`, returnTo)}
            >
              Edit officer
            </ActionLink>
          ) : undefined
        }
      />
      <SuccessNotice status={context.feedback} />
      {sectionNav}
      {visibleSection === "overview" && (
        <div className="space-y-5">
          {profile}
          <div
            className={`grid items-start gap-x-6 gap-y-5 ${showWarnings ? "lg:grid-cols-2" : ""}`}
          >
            {showWarnings && (
              <section aria-label="Warnings" className="space-y-2">
                <SectionHeading
                  title="Warnings"
                  action={
                    isAdmin(actor) && !warnings.error ? (
                      <CreateWarningForm officerId={officer.id} />
                    ) : undefined
                  }
                />
                {isAdmin(actor) &&
                  !approvedCountResult.error &&
                  approvedCount >= 3 && (
                    <p role="status" className="text-sm font-semibold">
                      Admin Review — three or more approved warnings.
                      Deactivation is a separate manual decision.
                    </p>
                  )}
                {warningCountResult.error && (
                  <p role="alert" className="text-sm">
                    Warning count unavailable. Only the visible preview is
                    shown.
                  </p>
                )}
                {isAdmin(actor) && approvedCountResult.error && (
                  <p role="alert" className="text-sm">
                    Approved warning count unavailable. Reload this page to
                    retry.
                  </p>
                )}
                {warnings.error ? (
                  <p role="alert" className="text-sm">
                    Warning history unavailable. Reload this page to retry.
                  </p>
                ) : visibleWarnings.length ? (
                  visibleWarnings.map((warning) => (
                    <article
                      key={warning.id}
                      className="space-y-1 border-b border-border py-2"
                    >
                      <div className="flex flex-wrap gap-3">
                        <StatusBadge status={warning.status} />
                        <time dateTime={warning.created_at}>
                          {formatDate(warning.created_at)}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {warning.reason}
                      </p>
                      {isAdmin(actor) && (
                        <>
                          <EditWarningForm
                            warningId={warning.id}
                            officerId={officer.id}
                            reason={warning.reason}
                          />
                          {warning.deleted_at === null ? (
                            <DeleteWarningForm
                              warningId={warning.id}
                              officerId={officer.id}
                            />
                          ) : (
                            <RestoreWarningForm
                              warningId={warning.id}
                              officerId={officer.id}
                            />
                          )}
                        </>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="text-sm">
                    {isAdmin(actor) ? "No warnings." : "No approved warnings."}
                  </p>
                )}
                <Link
                  className="text-sm underline"
                  href={sectionHref(officerIdParam, "warnings", urlParams)}
                >
                  {warningCountResult.error
                    ? "View all warnings"
                    : `View all warnings (${warningCount})`}
                </Link>
              </section>
            )}
            <div className="space-y-2">
              {eventContent}
              <Link
                className="text-sm underline"
                href={sectionHref(officerIdParam, "events", urlParams)}
              >
                {eventCountResult.error
                  ? "View all associated events"
                  : `View all associated events (${eventCount})`}
              </Link>
            </div>
          </div>
          {pointContent}
          <Link
            className="text-sm underline"
            href={sectionHref(officerIdParam, "points", urlParams)}
          >
            {transactionCountResult.error
              ? "View all point history"
              : `View all point history (${transactionCount})`}
          </Link>
        </div>
      )}
      {visibleSection === "warnings" && (
        <div className="max-w-4xl">{warningContent}</div>
      )}
      {visibleSection === "events" && (
        <div className="max-w-4xl">{eventContent}</div>
      )}
      {visibleSection === "points" && (
        <div className="max-w-5xl">{pointContent}</div>
      )}
    </div>
  );
}
