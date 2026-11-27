import { formatLabel } from "@/lib/presentation";

export type TopRankTier = 1 | 2 | 3;

export const TOP_RANK_META: Record<
  TopRankTier,
  { badgeText: string; srLabel: string }
> = {
  1: { badgeText: "1st", srLabel: "1st place" },
  2: { badgeText: "2nd", srLabel: "2nd place" },
  3: { badgeText: "3rd", srLabel: "3rd place" },
};

export function getTopRankTier(rank: number): TopRankTier | null {
  if (rank === 1 || rank === 2 || rank === 3) return rank;
  return null;
}

export type GroupedRankingBranch = {
  id: number;
  name: string;
  color?: string | null;
};

export type GroupedRankingOfficer = {
  id: number;
  name: string;
  total_points: number;
  normal_points: number;
  negative_points: number;
  positionId: number | null;
  positionName: string;
  branches: GroupedRankingBranch[];
};

export type RankingGroup = {
  key: string;
  id: number | null;
  label: string;
  color?: string | null;
  rows: GroupedRankingOfficer[];
  averagePoints: number;
};

function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

function finalizeGroups(
  buckets: Map<
    string,
    {
      id: number | null;
      label: string;
      color?: string | null;
      rows: GroupedRankingOfficer[];
    }
  >,
): RankingGroup[] {
  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const sum = bucket.rows.reduce(
        (acc, row) => acc + Number(row.total_points ?? 0),
        0,
      );
      const averagePoints =
        bucket.rows.length > 0 ? roundPoints(sum / bucket.rows.length) : 0;
      return {
        key,
        id: bucket.id,
        label: bucket.label,
        color: bucket.color,
        rows: bucket.rows,
        averagePoints,
      };
    })
    .sort((a, b) => {
      if (a.id === null && b.id !== null) return 1;
      if (a.id !== null && b.id === null) return -1;
      return a.label.localeCompare(b.label);
    });
}

export function groupRankingByBranch(
  rows: readonly GroupedRankingOfficer[],
): RankingGroup[] {
  const buckets = new Map<
    string,
    {
      id: number | null;
      label: string;
      color?: string | null;
      rows: GroupedRankingOfficer[];
    }
  >();

  for (const row of rows) {
    if (row.branches.length === 0) {
      const key = "unassigned";
      const bucket = buckets.get(key) ?? {
        id: null,
        label: "No branch",
        rows: [],
      };
      bucket.rows.push(row);
      buckets.set(key, bucket);
      continue;
    }

    const seenBranchIds = new Set<number>();
    for (const branch of row.branches) {
      if (seenBranchIds.has(branch.id)) continue;
      seenBranchIds.add(branch.id);
      const key = `branch-${branch.id}`;
      const bucket = buckets.get(key) ?? {
        id: branch.id,
        label: formatLabel(branch.name),
        color: branch.color,
        rows: [],
      };
      bucket.rows.push(row);
      buckets.set(key, bucket);
    }
  }

  return finalizeGroups(buckets);
}

export function groupRankingByPosition(
  rows: readonly GroupedRankingOfficer[],
): RankingGroup[] {
  const buckets = new Map<
    string,
    {
      id: number | null;
      label: string;
      color?: string | null;
      rows: GroupedRankingOfficer[];
    }
  >();

  for (const row of rows) {
    const key =
      row.positionId !== null ? `position-${row.positionId}` : "unassigned";
    const bucket = buckets.get(key) ?? {
      id: row.positionId,
      label: row.positionName || "Unassigned",
      rows: [],
    };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }

  return finalizeGroups(buckets);
}
