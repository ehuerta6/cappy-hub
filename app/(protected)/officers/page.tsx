import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";
import { withReturnTo } from "@/lib/return-context";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ActionLink,
  BranchBadges,
  ListFilterBar,
  PageHeader,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
import { ListPagination } from "@/components/list-pagination";
import { formatLabel } from "@/lib/presentation";
import { searchOrFilter } from "@/lib/list-search";
import { listPageUrl } from "@/lib/list-url";
import { officerListFiltersSchema } from "./filter-validation";

type OfficerListSearchParams = Record<string, string | string[] | undefined>;
const OFFICERS_PER_PAGE = 8;

export default async function OfficersPage({
  searchParams,
}: {
  searchParams: Promise<OfficerListSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const params = await searchParams;
  const filters = officerListFiltersSchema.parse(params);
  const {
    q: search,
    status,
    position: positionId,
    branch: branchId,
    page: requestedPage,
  } = filters;
  const supabase = await createClient();
  const officerSelection =
    "*,positions(name),officer_branches(branch_id,branches(name)),filter_branch:officer_branches(branch_id)";

  const filterSearch = new URLSearchParams();
  if (search) filterSearch.set("q", search);
  if (status !== "active") filterSearch.set("status", status);
  if (positionId !== undefined)
    filterSearch.set("position", String(positionId));
  if (branchId !== undefined) filterSearch.set("branch", String(branchId));

  let officersQuery = supabase
    .from("officers")
    .select(officerSelection, { count: "exact" });
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

  const [officersResult, positionsResult, branchesResult] = await Promise.all([
    officersQuery
      .order("name")
      .order("id")
      .range(
        (requestedPage - 1) * OFFICERS_PER_PAGE,
        requestedPage * OFFICERS_PER_PAGE - 1,
      ),
    supabase.from("positions").select("id,name").order("name"),
    supabase.from("branches").select("id,name").order("name"),
  ]);
  if (officersResult.error || positionsResult.error || branchesResult.error)
    throw new Error("Failed to load officers");

  const officerCount = officersResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(officerCount / OFFICERS_PER_PAGE));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage)
    redirect(listPageUrl("/officers", filterSearch, page));
  const directoryHref = listPageUrl("/officers", filterSearch, page);

  const hasFilters = Boolean(
    search || status !== "active" || positionId || branchId,
  );
  const officers = officersResult.data;
  const returnTo = directoryHref;
  return (
    <div data-page-width="wide" className="space-y-3">
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
          Manage catalogs
        </Link>
      )}
      <>
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
        <p className="text-sm text-muted">
          {officerCount === 0
            ? "0 officers"
            : `Showing ${(page - 1) * OFFICERS_PER_PAGE + 1}–${Math.min(page * OFFICERS_PER_PAGE, officerCount)} of ${officerCount} officers`}
        </p>
        {officers.length === 0 ? (
          <p>
            {hasFilters
              ? "No officers match these filters."
              : "No officers yet."}
          </p>
        ) : (
          <TableFrame compact label="Officers">
            <table className="table-fixed text-sm leading-5">
              <thead>
                <tr>
                  <th scope="col" className="w-[19%]">
                    Name
                  </th>
                  <th scope="col" className="w-[28%]">
                    Contact
                  </th>
                  <th scope="col" className="w-[14%]">
                    Position
                  </th>
                  <th scope="col" className="w-[13%]">
                    Classification
                  </th>
                  <th scope="col" className="w-[17%]">
                    Branches
                  </th>
                  <th scope="col" className="w-[9%]">
                    Status
                  </th>
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
                    <td className="text-muted">
                      <span className="block break-all">
                        <span className="mr-1 text-xs text-subtle">UTEP</span>
                        {officer.utep_email ? (
                          <a href={`mailto:${officer.utep_email}`}>
                            {officer.utep_email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </span>
                      <span className="block break-all">
                        <span className="mr-1 text-xs text-subtle">
                          Personal
                        </span>
                        {officer.personal_email ? (
                          <a href={`mailto:${officer.personal_email}`}>
                            {officer.personal_email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </span>
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
        <ListPagination
          pathname="/officers"
          label="Officer"
          filters={filterSearch}
          page={page}
          totalPages={totalPages}
          totalCount={officerCount}
          countLabel="officers"
        />
      </>
    </div>
  );
}
