import { canViewSystemLog, getAuthorizationContext } from "@/lib/authorization";
import { PageHeader, TableFrame } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { formatLabel } from "@/lib/presentation";
import Link from "next/link";
import { redirect } from "next/navigation";

type AuditDetails =
  Database["public"]["Tables"]["audit_logs"]["Row"]["details"];
const SYSTEM_LOG_PAGE_SIZE = 50;

function describeDetails(details: AuditDetails) {
  if (!details || typeof details !== "object" || Array.isArray(details))
    return "View details";
  const values = details as Record<string, AuditDetails>;
  if (values.old_role && values.new_role)
    return `${values.old_role} → ${values.new_role}`;
  if (values.before && values.after) {
    const before = values.before as Record<string, AuditDetails>;
    const after = values.after as Record<string, AuditDetails>;
    const changed = Object.keys(after).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    );
    return changed.length ? `Changed ${changed.join(", ")}` : "View changes";
  }
  if (values.points != null)
    return `${values.points} points for officer #${values.officer_id}`;
  if (values.target_officer_id != null)
    return `Officer #${values.target_officer_id}`;
  if (values.officer_name) return String(values.officer_name);
  if (
    values.after &&
    typeof values.after === "object" &&
    !Array.isArray(values.after)
  ) {
    const after = values.after as Record<string, AuditDetails>;
    if (after.name) return String(after.name);
  }
  if (values.name) return String(values.name);
  return "View details";
}

export default async function SystemLogPage({
  searchParams,
}: PageProps<"/system-log">) {
  const actor = await getAuthorizationContext();
  if (!canViewSystemLog(actor)) redirect("/access-denied");
  const rawPage = (await searchParams).page;
  const requestedPage = typeof rawPage === "string" ? Number(rawPage) : 1;
  const page =
    Number.isSafeInteger(requestedPage) &&
    requestedPage > 0 &&
    requestedPage <= Math.floor(Number.MAX_SAFE_INTEGER / SYSTEM_LOG_PAGE_SIZE)
      ? requestedPage
      : 1;
  const supabase = await createClient();
  const {
    data: entries,
    count,
    error,
  } = await supabase
    .from("audit_logs")
    .select("id,actor_id,action,entity_type,entity_id,details,created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * SYSTEM_LOG_PAGE_SIZE, page * SYSTEM_LOG_PAGE_SIZE - 1);
  if (error) throw new Error(`Failed to load System Log: ${error.message}`);

  const actorIds = [
    ...new Set(
      entries
        .map((entry) => entry.actor_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const officerResult = actorIds.length
    ? await supabase
        .from("officers")
        .select("auth_user_id,name")
        .in("auth_user_id", actorIds)
    : null;
  if (officerResult?.error) throw new Error("Failed to load log actors");
  const officerNames = new Map(
    (officerResult?.data ?? []).map((officer) => [
      officer.auth_user_id,
      officer.name,
    ]),
  );
  const total = count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Log"
        description="Changes made in Cappy Hub, newest first."
      />
      <TableFrame>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap text-zinc-400">
                  {new Date(entry.created_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "America/Denver",
                  })}
                </td>
                <td>
                  {entry.actor_id === null
                    ? "System"
                    : (officerNames.get(entry.actor_id) ??
                      `Account ${entry.actor_id.slice(0, 8)}…`)}
                </td>
                <td>{formatLabel(entry.action.replaceAll(".", " "))}</td>
                <td>
                  {formatLabel(entry.entity_type)} #{entry.entity_id}
                </td>
                <td>
                  <details>
                    <summary className="cursor-pointer">
                      {describeDetails(entry.details)}
                    </summary>
                    <pre className="mt-2 max-w-md overflow-x-auto whitespace-pre-wrap text-xs text-zinc-400">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
      {entries.length === 0 && <p>No audit entries on this page.</p>}
      <div className="flex items-center justify-between text-sm text-zinc-400">
        <span>
          Page {page} · {total} entries
        </span>
        <div className="flex gap-4">
          {page > 1 && (
            <Link href={`/system-log?page=${page - 1}`}>Previous</Link>
          )}
          {page * SYSTEM_LOG_PAGE_SIZE < total && (
            <Link href={`/system-log?page=${page + 1}`}>Next</Link>
          )}
        </div>
      </div>
    </div>
  );
}
