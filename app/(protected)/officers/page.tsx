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
  SectionHeading,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
import { formatDateTime, formatLabel } from "@/lib/presentation";
import { searchOrFilter } from "@/lib/list-search";
import { listPageUrl } from "@/lib/list-url";
import { officerListFiltersSchema } from "./filter-validation";
import { WarningDecisionForm } from "./warning-forms";

type OfficerListSearchParams = Record<string, string | string[] | undefined>;
const OFFICERS_PER_PAGE = 8;
const WARNINGS_PER_PAGE = 5;

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
    reviewPage: requestedReviewPage,
    view,
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

  const [officersResult, positionsResult, branchesResult, pendingCountResult] =
    await Promise.all([
      officersQuery
        .order("name")
        .order("id")
        .range(
          (requestedPage - 1) * OFFICERS_PER_PAGE,
          requestedPage * OFFICERS_PER_PAGE - 1,
        ),
      supabase.from("positions").select("id,name").order("name"),
      supabase.from("branches").select("id,name").order("name"),
      supabase
        .from("officer_warnings")
        .select("id,warning_approvals!inner(approver_officer_id,decision)", {
          count: "exact",
          head: true,
        })
        .eq("status", "pending")
        .is("voided_at", null)
        .eq("warning_approvals.approver_officer_id", actor.id)
        .eq("warning_approvals.decision", "pending"),
    ]);
  if (
    officersResult.error ||
    positionsResult.error ||
    branchesResult.error ||
    pendingCountResult.error
  )
    throw new Error("Failed to load officers");

  const officerCount = officersResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(officerCount / OFFICERS_PER_PAGE));
  const page = Math.min(requestedPage, totalPages);
  if (view === "directory" && page !== requestedPage)
    redirect(listPageUrl("/officers", filterSearch, page));
  const directoryHref = listPageUrl("/officers", filterSearch, page);
  const warningCount = pendingCountResult.count ?? 0;
  const reviewTotalPages = Math.max(
    1,
    Math.ceil(warningCount / WARNINGS_PER_PAGE),
  );
  const reviewPage = Math.min(requestedReviewPage, reviewTotalPages);
  const reviewHref = (targetPage: number) => {
    const search = new URLSearchParams(filterSearch);
    if (page > 1) search.set("page", String(page));
    search.set("view", "warnings");
    if (targetPage > 1) search.set("reviewPage", String(targetPage));
    return `/officers?${search}` as const;
  };
  if (
    view === "warnings" &&
    (page !== requestedPage || reviewPage !== requestedReviewPage)
  )
    redirect(reviewHref(reviewPage));
  const pendingWarnings =
    view === "warnings" && warningCount > 0
      ? await supabase
          .from("officer_warnings")
          .select(
            "id,officer_id,reason,created_at,officers!officer_warnings_officer_id_fkey(id,name),eligible:warning_approvals!inner(approver_officer_id,decision)",
          )
          .eq("status", "pending")
          .is("voided_at", null)
          .eq("eligible.approver_officer_id", actor.id)
          .eq("eligible.decision", "pending")
          .order("created_at")
          .order("id")
          .range(
            (reviewPage - 1) * WARNINGS_PER_PAGE,
            reviewPage * WARNINGS_PER_PAGE - 1,
          )
      : null;
  if (pendingWarnings?.error)
    throw new Error("Failed to load pending warnings");

  const hasFilters = Boolean(
    search || status !== "active" || positionId || branchId,
  );
  const officers = officersResult.data;
  const returnTo = view === "warnings" ? reviewHref(reviewPage) : directoryHref;
  return (
    <div data-page-width="wide" className="space-y-3">
      <PageHeader
        title="Officers"
        description={
          view === "warnings"
            ? "Review warning decisions assigned to you."
            : "Club directory and branch memberships."
        }
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
      {view === "directory" && warningCount > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-foreground">
            {warningCount} {warningCount === 1 ? "warning" : "warnings"}{" "}
            awaiting your decision
          </span>
          <Link href={reviewHref(1)} className="underline underline-offset-4">
            Review decisions
          </Link>
        </p>
      )}
      {view === "warnings" ? (
        <section className="space-y-3" aria-label="Warning decisions">
          <SectionHeading
            title="Warnings awaiting your decision"
            action={
              <Link href={directoryHref} className="text-sm underline">
                Back to directory
              </Link>
            }
          />
          {(pendingWarnings?.data ?? []).length === 0 ? (
            <p>No warning decisions are awaiting you.</p>
          ) : (
            pendingWarnings?.data.map((warning) => (
              <article
                key={warning.id}
                id={`warning-${warning.id}`}
                className="space-y-2 rounded-lg border border-border p-4"
              >
                <h3 className="font-semibold text-foreground">
                  <Link
                    href={withReturnTo(
                      `/officers/${warning.officer_id}`,
                      returnTo,
                    )}
                  >
                    {warning.officers?.name ?? `Officer ${warning.officer_id}`}
                  </Link>
                </h3>
                <p className="whitespace-pre-wrap break-words">
                  {warning.reason}
                </p>
                <p className="text-sm text-muted">
                  Created {formatDateTime(warning.created_at)} · Your decision:
                  Pending
                </p>
                <WarningDecisionForm warningId={warning.id} />
              </article>
            ))
          )}
          <nav
            aria-label="Warning decision pages"
            className="flex flex-wrap items-center gap-4 text-sm"
          >
            {reviewPage > 1 && (
              <Link href={reviewHref(reviewPage - 1)}>Previous</Link>
            )}
            <span>
              Page {reviewPage} of {reviewTotalPages} · {warningCount} pending
            </span>
            {reviewPage < reviewTotalPages && (
              <Link href={reviewHref(reviewPage + 1)}>Next</Link>
            )}
          </nav>
        </section>
      ) : (
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
                          href={withReturnTo(
                            `/officers/${officer.id}`,
                            returnTo,
                          )}
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
          <nav
            aria-label="Officer directory pages"
            className="flex flex-wrap items-center gap-4 text-sm"
          >
            {page > 1 && (
              <Link href={listPageUrl("/officers", filterSearch, page - 1)}>
                Previous
              </Link>
            )}
            <span>
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link href={listPageUrl("/officers", filterSearch, page + 1)}>
                Next
              </Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
