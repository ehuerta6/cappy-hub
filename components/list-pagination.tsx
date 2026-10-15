import Link from "next/link";
import { ListPageSelector } from "@/components/list-page-selector";
import { listPageUrl } from "@/lib/list-url";
import type { ListRoute } from "@/lib/return-context";
import type { Route } from "next";

type ListPaginationProps = {
  pathname: ListRoute | Route;
  label: string;
  filters: URLSearchParams;
  page: number;
  totalPages: number;
  totalCount?: number;
  countLabel?: string;
  pageParam?: string;
  getPageHref?: (page: number) => Route;
};

export function ListPagination({
  pathname,
  label,
  filters,
  page,
  totalPages,
  totalCount,
  countLabel,
  pageParam = "page",
  getPageHref,
}: ListPaginationProps) {
  const filterParams = new URLSearchParams(
    [...filters.entries()].filter(([key]) => key !== pageParam),
  );
  const filterEntries = [...filterParams.entries()];
  const pageHref = (targetPage: number) =>
    getPageHref?.(targetPage) ??
    listPageUrl(
      pathname as ListRoute,
      filterParams,
      targetPage,
      pageParam as "page" | "rankPage" | "reviewPage",
    );
  const linkClassName =
    "inline-flex size-8 items-center justify-center rounded border border-border bg-surface text-muted transition-colors hover:border-border-strong hover:bg-hover hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted";
  const renderControl = (title: string, symbol: string, targetPage: number) =>
    targetPage < 1 ||
    targetPage > totalPages ||
    (title === "First page" && page === 1) ||
    (title === "Last page" && page === totalPages) ? (
      <button
        key={title}
        type="button"
        className={`${linkClassName} cursor-not-allowed opacity-40`}
        disabled
        aria-label={title}
        title={title}
      >
        {symbol}
      </button>
    ) : (
      <Link
        key={title}
        href={pageHref(targetPage)}
        className={linkClassName}
        aria-label={title}
        title={title}
      >
        {symbol}
      </Link>
    );

  return (
    <div className="flex min-w-0 flex-nowrap items-center justify-between gap-3 text-sm">
      {totalCount !== undefined && countLabel ? (
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {totalCount} {countLabel}
        </span>
      ) : (
        <span />
      )}
      {totalPages > 1 && (
        <nav
          aria-label={`${label} pages`}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap"
        >
          {renderControl("First page", "«", 1)}
          {renderControl("Previous page", "‹", page - 1)}
          <ListPageSelector
            pathname={pathname}
            label={label}
            filters={filterEntries}
            page={page}
            totalPages={totalPages}
            pageParam={pageParam}
          />
          {renderControl("Next page", "›", page + 1)}
          {renderControl("Last page", "»", totalPages)}
        </nav>
      )}
    </div>
  );
}
