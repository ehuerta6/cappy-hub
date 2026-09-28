import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";
import TransactionTable from "@/app/(protected)/points/transaction-table";
import { eventStatus, displayDate } from "@/lib/event-status";
import Link from "next/link";
import { connection } from "next/server";
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
import { formatLabel } from "@/lib/presentation";
import RoleForm from "./role-form";

export default async function OfficerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getAuthorizationContext();
  await connection();
  const supabase = await createClient();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const { data: officer, error } = await supabase
    .from("officers")
    .select("*, positions(name), officer_branches(branches(name))")
    .eq("id", Number(id))
    .maybeSingle();
  if (error) throw new Error(`Failed to load officer: ${error.message}`);
  if (!officer) notFound();
  const [total, events, transactions] = await Promise.all([
    supabase
      .from("officer_point_totals")
      .select("total_points")
      .eq("id", Number(id))
      .single(),
    supabase
      .from("event_officers")
      .select("events(*)")
      .eq("officer_id", Number(id)),
    supabase
      .from("point_transactions")
      .select("*,officers(id,name),events(id,name)")
      .is("removed_at", null)
      .eq("officer_id", Number(id))
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100),
  ]);
  if (total.error || events.error || transactions.error)
    throw new Error("Failed to load officer history");
  return (
    <div className="space-y-8">
      <PageHeader
        title={officer.name}
        action={
          canManageOfficers(actor) ? (
            <ActionLink href={`/officers/${id}/edit`}>Edit officer</ActionLink>
          ) : undefined
        }
      />
      <dl className="grid max-w-2xl grid-cols-[7rem_minmax(0,1fr)] gap-x-5 gap-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-sm">
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
      <p className="text-lg font-semibold text-zinc-100">
        Total points: <PointValue value={total.data.total_points ?? 0} />
      </p>
      <section>
        <SectionHeading title="Associated events" />
        {!events.data.length && <p>No associated events yet.</p>}
        <ul>
          {events.data.map(({ events: event }) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center gap-2 border-b border-zinc-800 py-2 text-sm"
            >
              <Link
                href={`/events/${event.id}`}
                className="font-medium text-zinc-200 hover:underline"
              >
                {event.name}
              </Link>
              <span className="text-zinc-500">
                {displayDate(event.starts_at)}
              </span>
              <StatusBadge status={eventStatus(event)} />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <SectionHeading
          title="Point history"
          description="Latest 100 transactions"
        />
        <TableFrame>
          <TransactionTable transactions={transactions.data} />
        </TableFrame>
      </section>
    </div>
  );
}
