import {
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import ContextualBackLink from "@/components/contextual-back-link";
import {
  getAuthorizationContext,
  canManageOfficers,
  isAdmin,
} from "@/lib/authorization";
import PointTransactionTable from "@/components/point-transaction-table";
import { eventStatus } from "@/lib/event-status";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ActionLink,
  BranchBadges,
  PageHeader,
  PointValue,
  SectionHeading,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
import { formatDate, formatLabel } from "@/lib/presentation";
import RoleForm from "./role-form";
import { CreateWarningForm, DeleteWarningForm } from "../warning-forms";

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
  const warningStatus =
    typeof context.warningStatus === "string"
      ? context.warningStatus
      : undefined;
  if (!/^-?[1-9]\d*$/.test(officerIdParam)) notFound();
  const officerId = Number(officerIdParam);
  const { data: officer, error } = await supabase
    .from("officers")
    .select("*, positions(name), officer_branches(branches(name))")
    .eq("id", officerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load officer: ${error.message}`);
  if (!officer) notFound();
  const [total, events, transactions] = await Promise.all([
    supabase
      .from("officer_point_totals")
      .select("total_points")
      .eq("id", officerId)
      .single(),
    supabase
      .from("event_officers")
      .select("events(*)")
      .eq("officer_id", officerId),
    supabase
      .from("point_transactions")
      .select("*,officers(id,name),events(id,name),tasks(id,title)")
      .is("removed_at", null)
      .eq("officer_id", officerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100),
  ]);
  if (total.error || events.error || transactions.error)
    throw new Error("Failed to load officer history");
  const showWarnings = isAdmin(actor) || actor.id === officer.id;
  const warnings = showWarnings
    ? await supabase
        .from("officer_warnings")
        .select("*,warning_approvals(*)")
        .eq("officer_id", officer.id)
        .order("created_at", { ascending: false })
    : null;
  if (warnings?.error) throw new Error("Failed to load warnings");
  const visibleWarnings = warnings?.data ?? [];
  const selectedStatus = ["pending", "approved", "rejected"].includes(
    warningStatus ?? "",
  )
    ? warningStatus
    : undefined;
  const displayedWarnings =
    isAdmin(actor) && selectedStatus
      ? visibleWarnings.filter((warning) => warning.status === selectedStatus)
      : visibleWarnings;
  const approvedCount = visibleWarnings.filter(
    (warning) => warning.status === "approved",
  ).length;
  const approverNames = isAdmin(actor)
    ? await supabase.from("officers").select("auth_user_id,name")
    : null;
  if (approverNames?.error) throw new Error("Failed to load approver names");
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
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-4">
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-5 gap-y-2 rounded-lg border border-border bg-surface/30 p-4 text-sm [&>dt]:mt-0 [&>dd]:mt-0 [&>dd]:min-w-0 [&>dd]:break-words">
            <dt>UTEP email</dt>
            <dd className="min-w-0 break-words">
              {officer.utep_email ?? "Not provided"}
            </dd>
            <dt>Personal email</dt>
            <dd className="min-w-0 break-words">
              {officer.personal_email ?? "Not provided"}
            </dd>
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
          <p className="text-lg font-semibold text-foreground">
            Total points: <PointValue value={total.data.total_points ?? 0} />
          </p>
        </div>
        <div className="min-w-0 space-y-4 rounded-lg border border-border p-4">
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
              <RoleForm
                officerId={officer.id}
                role={officer.application_role}
              />
            </section>
          )}
          {showWarnings && <p>Approved warnings: {approvedCount}</p>}
        </div>
      </div>
      <div
        className={`grid items-start gap-4 ${showWarnings ? "lg:grid-cols-2" : ""}`}
      >
        {showWarnings && (
          <section
            aria-label="Warnings"
            className="min-w-0 space-y-3 rounded-lg border border-border p-4"
          >
            <SectionHeading title="Warnings" />
            {isAdmin(actor) && approvedCount >= 3 && (
              <p role="status" className="font-semibold">
                Admin Review — three or more approved warnings. Deactivation is
                a separate manual decision.
              </p>
            )}
            {isAdmin(actor) && (
              <nav
                aria-label="Warning status"
                className="flex flex-wrap gap-4 text-sm"
              >
                {[
                  ["All", ""],
                  ["Pending", "pending"],
                  ["Approved", "approved"],
                  ["Rejected", "rejected"],
                ].map(([label, status]) => (
                  <Link
                    key={label}
                    href={withReturnTo(
                      status
                        ? `/officers/${officerIdParam}?warningStatus=${status}`
                        : `/officers/${officerIdParam}`,
                      returnTo,
                    )}
                    className="underline"
                    aria-current={
                      (selectedStatus ?? "") === status ? "page" : undefined
                    }
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            )}
            {displayedWarnings.length === 0 && (
              <p>
                {isAdmin(actor)
                  ? "No warnings in this view."
                  : "No approved warnings."}
              </p>
            )}
            {displayedWarnings.map((warning) => (
              <article
                key={warning.id}
                className="space-y-2 rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={warning.status} />
                  <time dateTime={warning.created_at}>
                    {formatDate(warning.created_at)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words">
                  {warning.reason}
                </p>
                {isAdmin(actor) && (
                  <>
                    <p className="text-sm">
                      Approvals:{" "}
                      {
                        warning.warning_approvals.filter(
                          (approval) => approval.decision === "approved",
                        ).length
                      }
                      /{warning.warning_approvals.length}
                    </p>
                    <ul className="text-sm text-muted">
                      {warning.warning_approvals.map((approval) => (
                        <li key={approval.approver_id}>
                          {approval.approver_role} (
                          {approverNames?.data?.find(
                            (person) =>
                              person.auth_user_id === approval.approver_id,
                          )?.name ?? approval.approver_id}
                          ): {approval.decision}
                        </li>
                      ))}
                    </ul>
                    <DeleteWarningForm
                      warningId={warning.id}
                      officerId={officer.id}
                    />
                  </>
                )}
              </article>
            ))}
            {isAdmin(actor) && <CreateWarningForm officerId={officer.id} />}
          </section>
        )}
        <section
          aria-label="Associated events"
          className="min-w-0 rounded-lg border border-border p-4"
        >
          <SectionHeading title="Associated events" />
          {!events.data.length && <p>No associated events yet.</p>}
          <ul>
            {events.data.map(({ events: event }) => (
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
                <span className="text-subtle">{event.event_date}</span>
                <StatusBadge status={eventStatus(event)} />
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section>
        <SectionHeading
          title="Point history"
          description="Latest 100 transactions"
        />
        <TableFrame>
          <PointTransactionTable transactions={transactions.data} />
        </TableFrame>
        <Link
          href={`/points?officer=${officer.id}`}
          className="mt-3 inline-block text-sm underline"
        >
          View all point history
        </Link>
      </section>
    </div>
  );
}
