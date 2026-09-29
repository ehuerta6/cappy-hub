import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ActionLink,
  BranchBadges,
  PageHeader,
  SectionHeading,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
import { formatLabel } from "@/lib/presentation";
import { WarningDecisionForm } from "./warning-forms";

export default async function OfficersPage() {
  const actor = await getAuthorizationContext();
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("officers")
    .select("*, positions(name), officer_branches(branches(name))")
    .order("name");
  if (error) throw new Error(`Failed to load officers: ${error.message}`);
  const pendingApprovals = await supabase
    .from("warning_approvals")
    .select("warning_id,approver_role")
    .eq("approver_id", actor.authUserId)
    .eq("decision", "pending");
  if (pendingApprovals.error)
    throw new Error("Failed to load warning approvals");
  const warningIds = pendingApprovals.data.map((row) => row.warning_id);
  const pendingWarnings = warningIds.length
    ? await supabase
        .from("officer_warnings")
        .select("id,officer_id,reason,created_at")
        .in("id", warningIds)
        .eq("status", "pending")
    : null;
  if (pendingWarnings?.error)
    throw new Error("Failed to load pending warnings");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Officers"
        description="Club directory and branch memberships."
        action={
          canManageOfficers(actor) ? (
            <ActionLink href="/officers/new">+ Add officer</ActionLink>
          ) : undefined
        }
      />
      {canManageOfficers(actor) && (
        <Link href="/officers/catalogs" className="text-sm underline">
          Manage positions and branches
        </Link>
      )}
      {pendingWarnings?.data && pendingWarnings.data.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Warnings awaiting your decision" />
          {pendingWarnings.data.map((warning) => (
            <article
              key={warning.id}
              className="space-y-2 rounded-lg border border-zinc-800 p-4"
            >
              <p className="font-semibold">
                {data.find((officer) => officer.id === warning.officer_id)
                  ?.name ?? `Officer ${warning.officer_id}`}
              </p>
              <p className="whitespace-pre-wrap">{warning.reason}</p>
              <p className="text-sm text-zinc-400">
                {new Date(warning.created_at).toLocaleString()}
              </p>
              <WarningDecisionForm warningId={warning.id} />
            </article>
          ))}
        </section>
      )}
      <TableFrame>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>UTEP email</th>
              <th>Personal email</th>
              <th>Position</th>
              <th>Classification</th>
              <th>Branches</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((officer) => (
              <tr key={officer.id}>
                <td>
                  <Link href={`/officers/${officer.id}`}>{officer.name}</Link>
                </td>
                <td className="text-zinc-400">{officer.utep_email ?? "—"}</td>
                <td className="text-zinc-400">
                  {officer.personal_email ?? "—"}
                </td>
                <td>{officer.positions.name}</td>
                <td>
                  {officer.classification
                    ? formatLabel(officer.classification)
                    : "Not specified"}
                </td>
                <td>
                  <BranchBadges
                    branches={officer.officer_branches.map(
                      (membership) => membership.branches.name,
                    )}
                  />
                </td>
                <td>
                  <StatusBadge status={officer.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
      {data.length === 0 && <p>No officers yet.</p>}
    </div>
  );
}
