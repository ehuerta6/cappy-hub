import { requireCurrentOfficer } from "@/lib/current-officer";
import { processCompletedEvents } from "@/lib/participation";
import Link from "next/link";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  ActionLink,
  BranchBadges,
  PageHeader,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
import { formatLabel } from "@/lib/presentation";

export default async function OfficersPage() {
  await requireCurrentOfficer();
  await connection();
  await processCompletedEvents();
  const { data, error } = await supabase
    .from("officers")
    .select("*, positions(name), officer_branches(branches(name))")
    .order("name");
  if (error) throw new Error(`Failed to load officers: ${error.message}`);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Officers"
        description="Club directory and branch memberships."
        action={<ActionLink href="/officers/new">+ Add officer</ActionLink>}
      />
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
