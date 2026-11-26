"use client";

import { useRef, useState } from "react";
import { formatLabel } from "@/lib/presentation";

export type OfficerOption = {
  id: number;
  name: string;
  branches?: string[];
};

/**
 * Searchable multi-select checkbox list for Officers with live count,
 * 1-click branch quick-select chips, and clear.
 * Keeps every checkbox mounted in the DOM (hidden when filtered out) and uses
 * native uncontrolled checkboxes with defaultChecked so FormData and React 19
 * form action state restoration always preserve checked selections.
 */
export function SearchableOfficerChecklist({
  officers,
  name = "officer_ids",
  initialSelectedIds = [],
  disabled = false,
  columns = 2,
}: {
  officers: OfficerOption[];
  name?: string;
  initialSelectedIds?: number[];
  disabled?: boolean;
  columns?: 1 | 2;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selectedCount, setSelectedCount] = useState(initialSelectedIds.length);
  const initialSet = new Set(initialSelectedIds);
  const normalized = query.trim().toLowerCase();

  const branchGroups = (() => {
    const map = new Map<string, number[]>();
    for (const officer of officers) {
      for (const branch of officer.branches ?? []) {
        const list = map.get(branch) ?? [];
        list.push(officer.id);
        map.set(branch, list);
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  })();

  const recount = () => {
    const boxes = listRef.current?.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][name="${name}"]`,
    );
    if (!boxes) return;
    let count = 0;
    boxes.forEach((box) => {
      if (box.checked) count += 1;
    });
    setSelectedCount(count);
  };

  const selectBranch = (officerIds: number[]) => {
    const idSet = new Set(officerIds.map(String));
    const boxes = listRef.current?.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][name="${name}"]`,
    );
    if (!boxes) return;
    boxes.forEach((box) => {
      if (idSet.has(box.value)) box.checked = true;
    });
    recount();
  };

  const clearAll = () => {
    const boxes = listRef.current?.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][name="${name}"]`,
    );
    boxes?.forEach((box) => {
      box.checked = false;
    });
    setSelectedCount(0);
  };

  if (officers.length === 0) {
    return <p className="text-sm text-muted">No active Officers available.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Filter officers by name…"
          aria-label="Filter officers by name"
          disabled={disabled}
          className="min-w-44 flex-1 text-sm"
        />
        <span className="text-xs font-medium tabular-nums text-muted">
          {selectedCount} selected
        </span>
        {selectedCount > 0 && (
          <button
            type="button"
            className="button-secondary min-h-8 px-2.5 py-1 text-xs"
            disabled={disabled}
            onClick={clearAll}
          >
            Clear
          </button>
        )}
      </div>
      {branchGroups.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Select officers by branch"
        >
          <span className="text-[11px] font-medium text-muted">
            Select branch:
          </span>
          {branchGroups.map(([branchName, ids]) => (
            <button
              key={branchName}
              type="button"
              disabled={disabled}
              onClick={() => selectBranch(ids)}
              className="!min-h-7 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-secondary transition-colors hover:border-brand-border hover:bg-brand-bg hover:text-brand"
            >
              + {formatLabel(branchName)} ({ids.length})
            </button>
          ))}
        </div>
      )}
      <div
        ref={listRef}
        className={`event-bulk-officer-list grid gap-1 rounded-md border border-border bg-surface-muted/40 p-2 ${
          columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
        }`}
      >
        {officers.map((officer) => {
          const matches =
            !normalized || officer.name.toLowerCase().includes(normalized);
          return (
            <label
              key={officer.id}
              className={`flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm font-normal hover:bg-hover ${
                matches ? "" : "hidden"
              }`}
            >
              <input
                type="checkbox"
                name={name}
                value={officer.id}
                defaultChecked={initialSet.has(officer.id)}
                disabled={disabled}
                onChange={recount}
              />
              <span className="truncate">{officer.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
