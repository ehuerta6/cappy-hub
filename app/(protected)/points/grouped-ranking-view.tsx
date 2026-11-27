"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Badge,
  BranchBadges,
  NegativePointValue,
  PointValue,
} from "@/components/ui";
import { TopRankPill } from "@/components/ranking-visuals";
import { ExportCsvButton } from "@/components/export-csv-button";
import { getTopRankTier, type RankingGroup } from "@/lib/points-ranking";

export default function GroupedPointsRankingClient({
  mode,
  groups,
  actorId,
  periodQuery,
  periodName,
}: {
  mode: "branch" | "position";
  groups: RankingGroup[];
  actorId: number;
  periodQuery?: string;
  periodName: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string>("all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const scopedGroups =
    selectedKey === "all"
      ? groups
      : groups.filter((group) => group.key === selectedKey);

  const visibleGroups = scopedGroups
    .map((group) => {
      const indexedRows = group.rows.map((officer, index) => ({
        officer,
        rank: index + 1,
      }));
      const filteredRows = normalizedQuery
        ? indexedRows.filter(({ officer }) =>
            officer.name.toLowerCase().includes(normalizedQuery),
          )
        : indexedRows;
      return {
        ...group,
        filteredRows,
      };
    })
    .filter((group) => !normalizedQuery || group.filteredRows.length > 0);

  const selectedGroup =
    selectedKey === "all"
      ? null
      : (groups.find((group) => group.key === selectedKey) ?? null);

  const exportParams = new URLSearchParams();
  if (periodQuery) exportParams.set("period", periodQuery);
  if (selectedGroup) {
    if (selectedGroup.id !== null) {
      exportParams.set(mode, String(selectedGroup.id));
    } else if (mode === "branch") {
      exportParams.set("branch", "none");
    }
  }
  const exportHref = exportParams.size
    ? `/api/exports/points/leaderboard?${exportParams.toString()}`
    : "/api/exports/points/leaderboard";

  const exportLabel =
    selectedGroup && (selectedGroup.id !== null || mode === "branch")
      ? `Export ${selectedGroup.label} CSV`
      : "Export leaderboard CSV";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={
            mode === "branch" ? "Filter by branch" : "Filter by position"
          }
        >
          <button
            type="button"
            onClick={() => setSelectedKey("all")}
            aria-pressed={selectedKey === "all"}
            className={`min-h-8 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              selectedKey === "all"
                ? "border-brand-border bg-brand-bg text-brand"
                : "border-border bg-surface text-secondary hover:border-border-strong hover:text-foreground"
            }`}
          >
            All {mode === "branch" ? "branches" : "positions"} ({groups.length})
          </button>
          {groups.map((group) => {
            const active = selectedKey === group.key;
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => setSelectedKey(group.key)}
                aria-pressed={active}
                className={`min-h-8 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-brand-border bg-brand-bg text-brand"
                    : "border-border bg-surface text-secondary hover:border-border-strong hover:text-foreground"
                }`}
              >
                {group.label} ({group.rows.length})
              </button>
            );
          })}
        </div>

        <ExportCsvButton
          href={exportHref}
          label={exportLabel}
          emptyMessage="No matching officers to export for this period."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Find officer in ranking…"
          aria-label="Find officer in ranking"
          className="w-full max-w-xs text-sm"
        />
        {mode === "branch" && (
          <p className="text-xs text-muted">
            Officers in multiple branches appear in each branch with their{" "}
            {periodName} period total.
          </p>
        )}
      </div>

      {visibleGroups.length === 0 ? (
        <p className="points-ranking-empty" role="status">
          No officers match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <div className="space-y-5">
          {visibleGroups.map((group) => (
            <section
              key={group.key}
              aria-label={`${group.label} ranking`}
              className="space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {mode === "branch" && group.id !== null ? (
                    <BranchBadges
                      branches={[{ name: group.label, color: group.color }]}
                    />
                  ) : (
                    <h3 className="text-sm font-semibold text-foreground">
                      {group.label}
                    </h3>
                  )}
                  <span className="text-xs font-medium tabular-nums text-muted">
                    {group.rows.length}{" "}
                    {group.rows.length === 1 ? "officer" : "officers"}
                  </span>
                </div>
                <span className="text-xs font-medium tabular-nums text-muted">
                  Avg <PointValue value={group.averagePoints} /> pts
                </span>
              </div>

              <div
                className="table-frame table-frame--compact table-frame--keyboard-scroll overflow-x-auto rounded-lg border border-border"
                role="region"
                aria-label={`${group.label} officer ranking`}
                tabIndex={0}
              >
                <table className="points-ranking-table">
                  <colgroup>
                    <col className="w-20" />
                    <col />
                    <col className="w-40" />
                    <col className="w-40" />
                    <col className="w-40" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Officer</th>
                      <th scope="col" className="text-right">
                        Normal Points
                      </th>
                      <th scope="col" className="text-right">
                        Negative Points
                      </th>
                      <th scope="col" className="text-right">
                        Overall Points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.filteredRows.map(({ officer, rank }) => {
                      const points = officer.total_points ?? 0;
                      const isMe = officer.id === actorId;
                      const tier = getTopRankTier(rank);
                      const rankAccent =
                        tier === 1
                          ? "font-semibold text-warning"
                          : tier === 2
                            ? "font-semibold text-info"
                            : tier === 3
                              ? "font-semibold text-teal"
                              : isMe
                                ? "font-semibold text-brand"
                                : "text-muted";
                      const rowClass = [
                        tier ? `ranking-row-tier-${tier}` : null,
                        isMe ? "bg-brand-bg/35" : null,
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <tr
                          key={`${group.key}-${officer.id}`}
                          data-rank-tier={tier ?? undefined}
                          className={rowClass || undefined}
                        >
                          <td>
                            <span className={`tabular-nums ${rankAccent}`}>
                              {rank}
                            </span>
                          </td>
                          <td>
                            <span className="inline-flex flex-wrap items-center gap-2">
                              <Link
                                className="points-officer-link"
                                href={
                                  `/officers/${officer.id}${periodQuery ? `?period=${encodeURIComponent(periodQuery)}` : ""}` as Route
                                }
                              >
                                {officer.name}
                              </Link>
                              {tier && <TopRankPill tier={tier} />}
                              {isMe && <Badge tone="blue">You</Badge>}
                            </span>
                          </td>
                          <td className="points-total text-right">
                            <PointValue value={officer.normal_points ?? 0} />
                          </td>
                          <td className="text-right text-sm font-semibold tabular-nums">
                            <NegativePointValue
                              value={officer.negative_points ?? 0}
                            />
                          </td>
                          <td className="points-total text-right">
                            <PointValue value={points} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
