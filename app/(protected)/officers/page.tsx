import {
  getAuthorizationContext,
  canManageOfficers,
  isAdmin,
  isLead,
} from "@/lib/authorization";
import { withReturnTo } from "@/lib/return-context";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, GraduationCap, Mail, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CopyTextButton } from "@/components/copy-button";
import {
  ActionLink,
  Badge,
  BranchBadges,
  ListFilterBar,
  PageHeader,
  StatusBadge,
  type ActiveFilterChip,
} from "@/components/ui";
import { formatLabel } from "@/lib/presentation";
import { searchOrFilter } from "@/lib/list-search";
import { listPageUrl } from "@/lib/list-url";
import { officerListFiltersSchema } from "./filter-validation";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";

type OfficerListSearchParams = Record<string, string | string[] | undefined>;

export default async function OfficersPage({
  searchParams,
}: {
  searchParams: Promise<OfficerListSearchParams>;
}) {
  const [actor, params, periodData, supabase] = await Promise.all([
    getAuthorizationContext(),
    searchParams,
    getAcademicPeriodData(),
    createClient(),
  ]);
  const periodSelection = resolveAcademicPeriod(params.period, periodData);
  const filters = officerListFiltersSchema.parse(params);
  const {
    q: search,
    scope,
    status,
    position: positionId,
    branch: branchId,
    warnings: warningFilter,
  } = filters;
  const admin = isAdmin(actor);
  const showBranchScope = isLead(actor) && actor.branchIds.length > 0;
  const effectiveScope = scope === "branch" && !showBranchScope ? "all" : scope;
  const effectiveWarningFilter = admin ? warningFilter : undefined;

  const officerSelection =
    "*,positions(name),officer_branches(branch_id,branches(name,color)),filter_branch:officer_branches(branch_id),scope_branch:officer_branches(branch_id)";

  const filterSearch = new URLSearchParams();
  if (params.period !== undefined)
    filterSearch.set("period", String(params.period));
  if (search) filterSearch.set("q", search);
  if (effectiveScope === "branch") filterSearch.set("scope", "branch");
  if (status !== "active") filterSearch.set("status", status);
  if (positionId !== undefined)
    filterSearch.set("position", String(positionId));
  if (branchId !== undefined) filterSearch.set("branch", String(branchId));
  if (effectiveWarningFilter)
    filterSearch.set("warnings", effectiveWarningFilter);

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
  if (effectiveScope === "branch" && actor.branchIds.length > 0)
    officersQuery = officersQuery
      .in("scope_branch.branch_id", actor.branchIds)
      .not("scope_branch", "is", null);

  const [officersResult, positionsResult, branchesResult, warningsResult] =
    await Promise.all([
      officersQuery.order("name").order("id"),
      supabase.from("positions").select("id,name").order("name"),
      supabase.from("branches").select("id,name").order("name"),
      admin
        ? supabase
            .from("officer_warnings")
            .select("officer_id")
            .eq("status", "approved")
            .is("voided_at", null)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (
    officersResult.error ||
    positionsResult.error ||
    branchesResult.error ||
    warningsResult.error
  )
    throw new Error("Failed to load officers");

  const activeWarningCounts = new Map<number, number>();
  for (const row of warningsResult.data ?? []) {
    activeWarningCounts.set(
      row.officer_id,
      (activeWarningCounts.get(row.officer_id) ?? 0) + 1,
    );
  }
  const reviewOfficerCount = [...activeWarningCounts.values()].filter(
    (count) => count >= 3,
  ).length;

  const officers =
    effectiveWarningFilter === "review"
      ? officersResult.data.filter(
          (officer) => (activeWarningCounts.get(officer.id) ?? 0) >= 3,
        )
      : officersResult.data;
  const officerCount = officers.length;
  const directoryHref = listPageUrl("/officers", filterSearch, 1);

  const hasFilters = Boolean(
    search ||
    status !== "active" ||
    positionId ||
    branchId ||
    effectiveScope === "branch" ||
    effectiveWarningFilter,
  );
  const returnTo = directoryHref;
  const canManage = canManageOfficers(actor) && !periodSelection.isHistorical;

  const quickViewHref = (
    nextScope: "all" | "branch",
    nextWarnings?: "review",
  ): Route => {
    const query = new URLSearchParams(filterSearch);
    if (nextScope === "branch") query.set("scope", "branch");
    else query.delete("scope");
    if (nextWarnings) query.set("warnings", nextWarnings);
    else query.delete("warnings");
    query.delete("page");
    const serialized = query.toString();
    return (serialized ? `/officers?${serialized}` : "/officers") as Route;
  };

  return (
    <div data-page-width="wide" data-nav-page="officers" className="space-y-4">
      <PageHeader
        title="Officers"
        description="Club directory and branch memberships."
        action={
          canManage ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href={
                  `/officers/catalogs${params.period ? `?period=${params.period}` : ""}` as Route
                }
                className="button-secondary inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-medium lg:min-h-0"
              >
                Manage catalogs
              </Link>
              <ActionLink
                href={
                  `/officers/new${params.period ? `?period=${params.period}` : ""}` as Route
                }
              >
                + Add officer
              </ActionLink>
            </div>
          ) : undefined
        }
      />

      {(showBranchScope || admin) && (
        <nav
          aria-label="Officer quick views"
          className="flex flex-wrap gap-5 border-b border-border"
        >
          <Link
            href={quickViewHref("all", undefined)}
            aria-current={
              effectiveScope === "all" && !effectiveWarningFilter
                ? "page"
                : undefined
            }
            className={`min-h-10 border-b-2 px-1 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              effectiveScope === "all" && !effectiveWarningFilter
                ? "border-brand text-brand"
                : "border-transparent text-secondary hover:text-foreground"
            }`}
          >
            All officers
          </Link>
          {showBranchScope && (
            <Link
              href={quickViewHref("branch", undefined)}
              aria-current={
                effectiveScope === "branch" && !effectiveWarningFilter
                  ? "page"
                  : undefined
              }
              className={`min-h-10 border-b-2 px-1 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                effectiveScope === "branch" && !effectiveWarningFilter
                  ? "border-brand text-brand"
                  : "border-transparent text-secondary hover:text-foreground"
              }`}
            >
              {actor.branchIds.length === 1 ? "My branch" : "My branches"}
            </Link>
          )}
          {admin && (
            <Link
              href={quickViewHref("all", "review")}
              aria-current={
                effectiveWarningFilter === "review" ? "page" : undefined
              }
              className={`min-h-10 border-b-2 px-1 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                effectiveWarningFilter === "review"
                  ? "border-brand text-brand"
                  : "border-transparent text-secondary hover:text-foreground"
              }`}
            >
              3+ warnings
              {reviewOfficerCount > 0 ? ` (${reviewOfficerCount})` : ""}
            </Link>
          )}
        </nav>
      )}

      <ListFilterBar
        key={JSON.stringify(filters)}
        action="/officers"
        label="Officer filters"
        active={hasFilters}
        clearHref={listPageUrl(
          "/officers",
          new URLSearchParams(
            params.period !== undefined
              ? [["period", String(params.period)]]
              : [],
          ),
          1,
        )}
        activeFilters={(() => {
          const chips: ActiveFilterChip[] = [];
          const without = (key: string): Route => {
            const next = new URLSearchParams(filterSearch);
            next.delete(key);
            const qs = next.toString();
            return (qs ? `/officers?${qs}` : "/officers") as Route;
          };
          if (search)
            chips.push({
              label: `Search: "${search}"`,
              removeHref: without("q"),
            });
          if (status !== "active")
            chips.push({
              label: `Status: ${formatLabel(status)}`,
              removeHref: without("status"),
            });
          if (positionId !== undefined) {
            const name =
              positionsResult.data.find((p) => p.id === positionId)?.name ??
              String(positionId);
            chips.push({
              label: `Position: ${name}`,
              removeHref: without("position"),
            });
          }
          if (branchId !== undefined) {
            const name =
              branchesResult.data.find((b) => b.id === branchId)?.name ??
              String(branchId);
            chips.push({
              label: `Branch: ${formatLabel(name)}`,
              removeHref: without("branch"),
            });
          }
          return chips;
        })()}
      >
        {params.period !== undefined && (
          <input type="hidden" name="period" value={String(params.period)} />
        )}
        {effectiveScope === "branch" && (
          <input type="hidden" name="scope" value="branch" />
        )}
        {effectiveWarningFilter && (
          <input type="hidden" name="warnings" value={effectiveWarningFilter} />
        )}
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

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted">
          {officerCount} officer{officerCount === 1 ? "" : "s"}
        </p>
      </div>

      {officers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
          <p className="text-sm text-muted">
            {hasFilters
              ? "No officers match these filters."
              : "No officers yet."}
          </p>
        </div>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {officers.map((officer) => {
            const warningCount = activeWarningCounts.get(officer.id) ?? 0;
            return (
              <li
                key={officer.id}
                className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-strong"
              >
                <div className="p-4 pb-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <Link
                      href={withReturnTo(`/officers/${officer.id}`, returnTo)}
                      className="truncate text-[0.95rem] font-semibold text-foreground transition-colors hover:text-brand hover:underline hover:underline-offset-3"
                      title={officer.name}
                    >
                      {officer.name}
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {admin && officer.application_role === "admin" && (
                        <Badge tone="blue">Admin</Badge>
                      )}
                      {admin && warningCount >= 3 && (
                        <Badge tone="amber">{warningCount} warnings</Badge>
                      )}
                      <StatusBadge status={officer.status} />
                    </div>
                  </div>
                  <p className="mt-1 truncate text-xs font-medium text-muted">
                    {officer.positions.name}
                  </p>
                </div>

                <div className="flex flex-1 flex-col gap-2.5 border-t border-border px-4 py-3 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex min-w-0 items-center gap-2 text-secondary">
                      <Mail
                        aria-hidden="true"
                        size={13}
                        className="shrink-0 text-subtle"
                      />
                      <span className="w-14 shrink-0 text-muted">UTEP</span>
                      {officer.utep_email ? (
                        <span className="flex min-w-0 flex-1 items-center gap-1">
                          <a
                            href={`mailto:${officer.utep_email}`}
                            className="min-w-0 truncate text-secondary hover:text-foreground hover:underline"
                            title={officer.utep_email}
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
                        <span className="text-subtle">—</span>
                      )}
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-secondary">
                      <Mail
                        aria-hidden="true"
                        size={13}
                        className="shrink-0 text-subtle opacity-0"
                      />
                      <span className="w-14 shrink-0 text-muted">Personal</span>
                      {officer.personal_email ? (
                        <span className="flex min-w-0 flex-1 items-center gap-1">
                          <a
                            href={`mailto:${officer.personal_email}`}
                            className="min-w-0 truncate text-secondary hover:text-foreground hover:underline"
                            title={officer.personal_email}
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
                        <span className="text-subtle">—</span>
                      )}
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-secondary">
                      <GraduationCap
                        aria-hidden="true"
                        size={13}
                        className="shrink-0 text-subtle"
                      />
                      <span className="w-14 shrink-0 text-muted">Class</span>
                      <span className="min-w-0 truncate">
                        {officer.classification
                          ? formatLabel(officer.classification)
                          : "Not specified"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <BranchBadges
                      branches={officer.officer_branches.map(
                        (membership) => membership.branches,
                      )}
                    />
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-border bg-surface-muted/50 px-4 py-2.5">
                  <Link
                    href={withReturnTo(`/officers/${officer.id}`, returnTo)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline hover:underline-offset-3"
                    aria-label={`View ${officer.name}'s profile`}
                  >
                    View profile
                    <ArrowUpRight aria-hidden="true" size={13} />
                  </Link>
                  {canManage && (
                    <Link
                      href={withReturnTo(
                        `/officers/${officer.id}/edit`,
                        returnTo,
                      )}
                      className="inline-flex items-center gap-1 text-xs font-medium text-secondary hover:text-foreground hover:underline hover:underline-offset-3"
                      aria-label={`Edit ${officer.name}`}
                    >
                      <Pencil aria-hidden="true" size={12} />
                      Edit
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
