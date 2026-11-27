import { Award, Medal, Trophy } from "lucide-react";
import { TOP_RANK_META, type TopRankTier } from "@/lib/points-ranking";

const TIER_PILL_CLASSES: Record<TopRankTier, string> = {
  1: "badge-amber",
  2: "badge-blue",
  3: "badge-teal",
};

export function TopRankIcon({ tier }: { tier: TopRankTier }) {
  if (tier === 1) return <Trophy size={11} aria-hidden="true" />;
  if (tier === 2) return <Medal size={11} aria-hidden="true" />;
  return <Award size={11} aria-hidden="true" />;
}

export function TopRankPill({ tier }: { tier: TopRankTier }) {
  const meta = TOP_RANK_META[tier];
  return (
    <span
      className={`status-badge inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${TIER_PILL_CLASSES[tier]}`}
      data-rank-badge={tier}
    >
      <TopRankIcon tier={tier} />
      <span>{meta.badgeText}</span>
      <span className="sr-only"> place</span>
    </span>
  );
}
