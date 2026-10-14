import Link from "next/link";
import { listPageUrl } from "@/lib/list-url";
import type { ListRoute } from "@/lib/return-context";

const PAGE_SELECT_LIMIT = 100;

type PaginatedListRoute = Extract<ListRoute, "/events" | "/tasks">;

type ListPaginationProps = {
  pathname: PaginatedListRoute;
  label: "Event" | "Task";
  filters: URLSearchParams;
  page: number;
  totalPages: number;
  totalCount: number;
  countLabel: string;
};

export function ListPagination({
  pathname,
  label,
  filters,
  page,
  totalPages,
  totalCount,
  countLabel,
}: ListPaginationProps) {
  const filterParams = new URLSearchParams(
    [...filters.entries()].filter(([key]) => key !== "page"),
  );
  const filterEntries = [...filterParams.entries()];
  const linkClassName =
    "inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong bg-surface-muted px-3 py-2 text-foreground hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted";
  const renderLink = (title: string, targetPage: number) =>
    targetPage < 1 || targetPage > totalPages ? (
      <button
        key={title}
        type="button"
        className="button-secondary min-h-11 px-3 py-2"
        disabled
      >
        {title}
      </button>
    ) : (
      <Link
        key={title}
        href={listPageUrl(pathname, filterParams, targetPage)}
        className={linkClassName}
      >
        {title}
      </Link>
    );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted">
        {totalCount} {countLabel}
      </span>
      {totalPages > 1 && (
        <nav
          aria-label={`${label} pages`}
          className="flex flex-wrap items-center gap-2"
        >
          {renderLink("First", 1)}
          {renderLink("Previous", page - 1)}
          <form
            action={pathname}
            method="get"
            className="flex flex-wrap items-center gap-2"
          >
            {filterEntries.map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <label className="flex items-center gap-2 text-foreground">
              <span>Page</span>
              {totalPages <= PAGE_SELECT_LIMIT ? (
                <select
                  name="page"
                  aria-label={`Select ${label.toLowerCase()} page`}
                  defaultValue={String(page)}
                >
                  {Array.from(
                    { length: totalPages },
                    (_, index) => index + 1,
                  ).map((pageNumber) => (
                    <option key={pageNumber} value={pageNumber}>
                      {pageNumber}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  name="page"
                  aria-label={`Select ${label.toLowerCase()} page`}
                  defaultValue={page}
                  min={1}
                  max={totalPages}
                  required
                  className="w-20"
                />
              )}
              <span>of {totalPages}</span>
            </label>
            <button
              type="submit"
              className="button-secondary min-h-11 px-3 py-2"
            >
              Go
            </button>
          </form>
          {renderLink("Next", page + 1)}
          {renderLink("Last", totalPages)}
        </nav>
      )}
    </div>
  );
}
