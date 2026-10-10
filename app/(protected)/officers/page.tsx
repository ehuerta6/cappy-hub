import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";
import { listReturnUrl, withReturnTo } from "@/lib/return-context";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ActionLink,
  BranchBadges,
  ListFilterBar,
  PageHeader,
  SectionHeading,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
import { formatDateTime, formatLabel } from "@/lib/presentation";
import { searchOrFilter } from "@/lib/list-search";
import { officerListFiltersSchema } from "./filter-validation";
import { WarningDecisionForm } from "./warning-forms";

type OfficerListSearchParams = Record<string, string | string[] | undefined>;

export default async function OfficersPage({
  searchParams,
}: {
  searchParams: Promise<OfficerListSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const params = await searchParams;
  const returnTo = listReturnUrl("/officers", params);
  const filters = officerListFiltersSchema.parse(params);
  const { q: search, status, position: positionId, branch: branchId } = filters;
  const supabase = await createClient();
  const officerSelection =
    "*,positions(name),officer_branches(branch_id,branches(name)),filter_branch:officer_branches(branch_id)";

  let officersQuery = supabase
    .from("officers")
    .select(officerSelection)
    .order("name");
  if (search)
    officersQuery = officersQuery.or(
      searchOrFilter(search, ["name", "utep_email", "personal_email"]),
    );
  if (status !== "all") officersQuery = officersQuery.eq("status", status);
  if (positionId !== undefined)
    officersQuery = officersQuery.eq("position_id", positionId);
  if (branchId !== undefined)
    officersQuery = officersQuery
      .eq("filter_branch.branch_id", branchId)
      .not("filter_branch", "is", null);

  const [officersResult, officerCountResult, positionsResult, branchesResult] =
    await Promise.all([
      officersQuery,
      supabase.from("officers").select("id", { count: "exact", head: true }),
      supabase.from("positions").select("id,name").order("name"),
      supabase.from("branches").select("id,name").order("name"),
    ]);
  if (
    officersResult.error ||
    officerCountResult.error ||
    positionsResult.error ||
    branchesResult.error
  )
    throw new Error("Failed to load officers");

  const pendingApprovals = await supabase
    .from("warning_approvals")
    .select("warning_id,approver_role")
    .eq("approver_officer_id", actor.id)
    .eq("decision", "pending");
  if (pendingApprovals.error)
    throw new Error("Failed to load warning approvals");
  const pendingWarningIds = pendingApprovals.data.map(
    (approval) => approval.warning_id,
  );
  const pendingWarnings = pendingWarningIds.length
    ? await supabase
        .from("officer_warnings")
        .select("id,officer_id,reason,created_at")
        .in("id", pendingWarningIds)
        .eq("status", "pending")
    : null;
  if (pendingWarnings?.error)
    throw new Error("Failed to load pending warnings");

  const warningOfficerIds = [
    ...new Set(
      (pendingWarnings?.data ?? []).map((warning) => warning.officer_id),
    ),
  ];
  const warningOfficers = warningOfficerIds.length
    ? await supabase
        .from("officers")
        .select("id,name")
        .in("id", warningOfficerIds)
    : null;
  if (warningOfficers?.error)
    throw new Error("Failed to load officers awaiting a warning decision");
  const warningOfficerNames = new Map(
    (warningOfficers?.data ?? []).map((officer) => [officer.id, officer.name]),
  );

  const hasFilters = Boolean(
    search || status !== "active" || positionId || branchId,
  );
  const officers = officersResult.data;
  return (
    <div data-page-width="wide" className="space-y-5">
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
      <ListFilterBar
        key={JSON.stringify(filters)}
        action="/officers"
        label="Officer filters"
        active={hasFilters}
        clearHref="/officers"
      >
        <label className="min-w-56 flex-1">
          Search officers
          <input
            type="search"
            name="q"
            defaultValue={search}
            maxLength={100}
            placeholder="Name or email"
          />
        </label>
        <label className="min-w-36">
          Status
          <select name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="min-w-44">
          Position
          <select name="position" defaultValue={positionId ?? ""}>
            <option value="">All positions</option>
            {positionsResult.data.map((position) => (
              <option key={position.id} value={position.id}>
                {position.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-40">
          Branch
          <select name="branch" defaultValue={branchId ?? ""}>
            <option value="">All branches</option>
            {branchesResult.data.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {formatLabel(branch.name)}
              </option>
            ))}
          </select>
        </label>
      </ListFilterBar>
      {pendingWarnings?.data && pendingWarnings.data.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Warnings awaiting your decision" />
          {pendingWarnings.data.map((warning) => (
            <article
              key={warning.id}
              id={`warning-${warning.id}`}
              className="space-y-2 rounded-lg border border-border p-4"
            >
              <p className="font-semibold text-foreground">
                {warningOfficerNames.get(warning.officer_id) ??
                  `Officer ${warning.officer_id}`}
              </p>
              <p className="whitespace-pre-wrap">{warning.reason}</p>
              <p className="text-sm text-muted">
                {formatDateTime(warning.created_at)}
              </p>
              <WarningDecisionForm warningId={warning.id} />
            </article>
          ))}
        </section>
      )}
      {officers.length === 0 ? (
        <p>
          {hasFilters && (officerCountResult.count ?? 0) > 0
            ? "No officers match these filters."
            : "No officers yet."}
        </p>
      ) : (
        <TableFrame compact>
          <table>
            <thead>
              <tr>
                <th scope="col" className="min-w-36">
                  Name
                </th>
                <th scope="col" className="min-w-48">
                  UTEP email
                </th>
                <th scope="col" className="min-w-48">
                  Personal email
                </th>
                <th scope="col" className="min-w-44">
                  Position
                </th>
                <th scope="col">Classification</th>
                <th scope="col">Branches</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {officers.map((officer) => (
                <tr key={officer.id}>
                  <td className="min-w-0">
                    <Link
                      href={withReturnTo(`/officers/${officer.id}`, returnTo)}
                      className="block break-words"
                    >
                      {officer.name}
                    </Link>
                  </td>
                  <td className="break-all text-muted">
                    {officer.utep_email ? (
                      <a href={`mailto:${officer.utep_email}`}>
                        {officer.utep_email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="break-all text-muted">
                    {officer.personal_email ? (
                      <a href={`mailto:${officer.personal_email}`}>
                        {officer.personal_email}
                      </a>
                    ) : (
                      "—"
                    )}
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
      )}
    </div>
  );
}
