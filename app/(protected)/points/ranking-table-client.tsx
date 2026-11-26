"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Badge, NegativePointValue, PointValue } from "@/components/ui";

export type RankingRow = {
  id: number;
  name: string;
  total_points: number;
  normal_points: number;
  negative_points: number;
};

export default function PointsRankingTableClient({
  rows,
  actorId,
  periodQuery,
}: {
  rows: RankingRow[];
  actorId: number;
  periodQuery?: string;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const indexedRows = rows.map((officer, index) => ({
    officer,
    rank: index + 1,
  }));
  const filteredRows = normalized
    ? indexedRows.filter(({ officer }) =>
        officer.name.toLowerCase().includes(normalized),
      )
    : indexedRows;

  return (
    <div className="points-ranking-wrap space-y-3">
      {rows.length > 5 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Find officer in ranking…"
            aria-label="Find officer in ranking"
            className="w-full max-w-xs text-sm"
          />
          {normalized && (
            <span className="text-xs font-medium tabular-nums text-muted">
              {filteredRows.length} of {rows.length} shown
            </span>
          )}
        </div>
      )}
      {filteredRows.length === 0 ? (
        <p className="points-ranking-empty" role="status">
          No officers match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <div
          className="table-frame table-frame--compact table-frame--keyboard-scroll overflow-x-auto rounded-lg border border-border"
          role="region"
          aria-label="Officer ranking"
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
              {filteredRows.map(({ officer, rank }) => {
                const points = officer.total_points ?? 0;
                const isMe = officer.id === actorId;
                const rankAccent =
                  rank === 1
                    ? "font-semibold text-warning"
                    : rank === 2
                      ? "font-semibold text-info"
                      : rank === 3
                        ? "font-semibold text-teal"
                        : isMe
                          ? "font-semibold text-brand"
                          : "text-muted";
                return (
                  <tr
                    key={officer.id}
                    id={isMe ? "my-rank" : undefined}
                    className={isMe ? "bg-brand-bg/35" : undefined}
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
      )}
    </div>
  );
}
