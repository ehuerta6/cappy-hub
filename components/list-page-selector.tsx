"use client";

import type { ListRoute } from "@/lib/return-context";
import type { Route } from "next";

type ListPageSelectorProps = {
  pathname: ListRoute | Route;
  label: string;
  filters: [string, string][];
  page: number;
  totalPages: number;
  pageParam: string;
};

export function ListPageSelector({
  pathname,
  label,
  filters,
  page,
  totalPages,
  pageParam,
}: ListPageSelectorProps) {
  return (
    <form action={pathname} method="get" className="flex items-center gap-1.5">
      {filters.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label className="relative flex items-center gap-1.5 text-xs text-muted">
        <span className="sr-only">Page</span>
        {totalPages <= 100 ? (
          <select
            key={page}
            name={pageParam}
            aria-label={`Select ${label.toLowerCase()} page`}
            defaultValue={String(page)}
            className="list-pagination__page-select"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (pageNumber) => (
                <option key={pageNumber} value={pageNumber}>
                  {pageNumber}
                </option>
              ),
            )}
          </select>
        ) : (
          <input
            key={page}
            type="number"
            name={pageParam}
            aria-label={`Select ${label.toLowerCase()} page`}
            defaultValue={page}
            min={1}
            max={totalPages}
            required
            className="list-pagination__page-input"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        )}
        {totalPages <= 100 && (
          <span className="list-pagination__caret" aria-hidden="true" />
        )}
        <span className="tabular-nums">of {totalPages}</span>
      </label>
    </form>
  );
}
